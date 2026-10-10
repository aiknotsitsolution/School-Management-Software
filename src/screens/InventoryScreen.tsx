import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Button, Card } from "../components/UI";
import { useAuth } from "../context/AuthContext";
import { get, send } from "../lib/api";
import { extractList, Row } from "../lib/format";
import { colors } from "../theme";

const CATEGORIES = [
  "Books",
  "Lab Equipment",
  "Sports",
  "Stationery",
  "IT Equipment",
  "Medical",
  "Furniture",
  "Other",
];
const UNITS = ["Pieces", "Sets", "Boxes", "Units", "Reams", "Kits", "Pairs"];

type InventoryItem = Row & {
  _id: string;
  itemName: string;
  category: string;
  quantity: number;
  reorderLevel: number;
  unit: string;
  supplier?: string;
  purchaseDate?: string;
};
type ItemForm = {
  itemName: string;
  category: string;
  quantity: string;
  reorderLevel: string;
  unit: string;
  supplier: string;
  purchaseDate: string;
};
type PickerState = { title: string; values: string[]; onSelect: (value: string) => void } | null;

function todayISO() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function dateInputValue(value?: string) {
  if (!value) return "";
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return match ? match[1] : "";
}

function dateLabel(value?: string) {
  const date = dateInputValue(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return "Not recorded";
  const parsed = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
  return parsed.toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function emptyForm(): ItemForm {
  return {
    itemName: "",
    category: "Stationery",
    quantity: "10",
    reorderLevel: "5",
    unit: "Pieces",
    supplier: "",
    purchaseDate: todayISO(),
  };
}

function formFromItem(item: InventoryItem): ItemForm {
  return {
    itemName: item.itemName || "",
    category: item.category || "Other",
    quantity: String(item.quantity ?? 0),
    reorderLevel: String(item.reorderLevel ?? 0),
    unit: item.unit || "Pieces",
    supplier: item.supplier || "",
    purchaseDate: dateInputValue(item.purchaseDate) || todayISO(),
  };
}

function parseItem(value: unknown): InventoryItem {
  if (!value || typeof value !== "object") {
    throw new Error("Inventory contains an invalid item.");
  }
  const row = value as Row;
  if (
    typeof row._id !== "string" ||
    typeof row.itemName !== "string" ||
    !Number.isFinite(Number(row.quantity))
  ) {
    throw new Error("An inventory item is missing its name, identifier or quantity.");
  }
  return {
    ...row,
    _id: row._id,
    itemName: row.itemName,
    category: typeof row.category === "string" && row.category ? row.category : "Other",
    quantity: Number(row.quantity),
    reorderLevel: Number(row.reorderLevel ?? 0),
    unit: typeof row.unit === "string" && row.unit ? row.unit : "Pieces",
    supplier: typeof row.supplier === "string" ? row.supplier : "",
    purchaseDate: typeof row.purchaseDate === "string" ? row.purchaseDate : "",
  };
}

function validateForm(form: ItemForm) {
  if (!form.itemName.trim()) return "Item name is required.";
  const quantity = Number(form.quantity);
  if (!form.quantity.trim() || !Number.isFinite(quantity) || quantity < 0) {
    return "Stock must be a valid non-negative number.";
  }
  const reorderLevel = Number(form.reorderLevel);
  if (!form.reorderLevel.trim() || !Number.isFinite(reorderLevel) || reorderLevel < 0) {
    return "Reorder level must be a valid non-negative number.";
  }
  if (!form.purchaseDate || !/^\d{4}-\d{2}-\d{2}$/.test(form.purchaseDate)) {
    return "Enter the restock date in YYYY-MM-DD format.";
  }
  const [year, month, day] = form.purchaseDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return "Enter a valid restock date.";
  }
  return "";
}

function CategoryPicker({
  picker,
  onClose,
}: {
  picker: PickerState;
  onClose: () => void;
}) {
  if (!picker) return null;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.modalBackdrop}>
        <View style={s.pickerCard}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>{picker.title}</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color={colors.muted} />
            </Pressable>
          </View>
          <FlatList
            data={picker.values}
            keyExtractor={(item) => item}
            renderItem={({ item }) => (
              <Pressable
                style={s.pickerRow}
                onPress={() => {
                  picker.onSelect(item);
                  onClose();
                }}
              >
                <Text style={s.pickerText}>{item}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.muted} />
              </Pressable>
            )}
          />
        </View>
      </View>
    </Modal>
  );
}

export default function InventoryScreen() {
  const { can } = useAuth();
  const canWrite = can("inventory:write");
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [form, setForm] = useState<ItemForm>(emptyForm);
  const [picker, setPicker] = useState<PickerState>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setLoadError("");
    try {
      const first = await get<InventoryItem[]>("/inventory?limit=1000&page=1");
      const firstPage = extractList(first.data).map(parseItem);
      const pages = Math.max(1, first.pages || 1);
      const rest = await Promise.all(
        Array.from({ length: pages - 1 }, (_, index) =>
          get<InventoryItem[]>(`/inventory?limit=1000&page=${index + 2}`),
        ),
      );
      const allItems = [
        ...firstPage,
        ...rest.flatMap((page) => extractList(page.data).map(parseItem)),
      ];
      setItems(allItems);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load inventory.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const categories = useMemo(
    () =>
      ["All", ...new Set([...CATEGORIES, ...items.map((item) => item.category)])],
    [items],
  );
  const filteredItems = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    return items.filter((item) => {
      const categoryMatch =
        categoryFilter === "All" || item.category === categoryFilter;
      const searchMatch =
        !search ||
        item.itemName.toLocaleLowerCase().includes(search) ||
        item.category.toLocaleLowerCase().includes(search) ||
        item._id.toLocaleLowerCase().includes(search) ||
        (item.supplier || "").toLocaleLowerCase().includes(search);
      return categoryMatch && searchMatch;
    });
  }, [items, query, categoryFilter]);
  const stats = useMemo(
    () => ({
      total: items.length,
      low: items.filter((item) => item.quantity < item.reorderLevel).length,
      categories: new Set(items.map((item) => item.category)).size,
      units: items.reduce((total, item) => total + item.quantity, 0),
    }),
    [items],
  );

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setModalVisible(true);
  };
  const openEdit = (item: InventoryItem) => {
    setEditing(item);
    setForm(formFromItem(item));
    setModalVisible(true);
  };

  const save = async () => {
    if (!canWrite || busy) return;
    const error = validateForm(form);
    if (error) {
      Alert.alert("Check item details", error);
      return;
    }
    setBusy(true);
    const payload = {
      itemName: form.itemName.trim(),
      category: form.category,
      quantity: Number(form.quantity),
      reorderLevel: Number(form.reorderLevel),
      unit: form.unit,
      supplier: form.supplier.trim(),
      purchaseDate: form.purchaseDate,
    };
    try {
      const response = editing
        ? await send<InventoryItem>(`/inventory/${encodeURIComponent(editing._id)}`, "PUT", payload)
        : await send<InventoryItem>("/inventory", "POST", payload);
      const saved = parseItem(response.data);
      setItems((current) =>
        editing
          ? current.map((item) => (item._id === editing._id ? saved : item))
          : [saved, ...current],
      );
      setModalVisible(false);
      setEditing(null);
      setForm(emptyForm());
      Alert.alert("Saved", editing ? "Inventory item updated." : "Inventory item added.");
    } catch (requestError) {
      Alert.alert(
        "Could not save item",
        requestError instanceof Error ? requestError.message : "Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const adjustStock = async (item: InventoryItem, change: 1 | -1) => {
    if (!canWrite || busy) return;
    const quantity = Math.max(0, item.quantity + change);
    setBusy(true);
    try {
      const response = await send<InventoryItem>(
        `/inventory/${encodeURIComponent(item._id)}`,
        "PUT",
        {
          itemName: item.itemName,
          category: item.category,
          quantity,
          reorderLevel: item.reorderLevel,
          unit: item.unit,
          supplier: item.supplier || "",
          purchaseDate: todayISO(),
        },
      );
      const updated = parseItem(response.data);
      setItems((current) =>
        current.map((entry) => (entry._id === item._id ? updated : entry)),
      );
    } catch (error) {
      Alert.alert(
        "Could not update stock",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const remove = (item: InventoryItem) => {
    if (!canWrite || busy) return;
    Alert.alert(
      "Delete inventory item?",
      `Remove "${item.itemName}" from the inventory? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            try {
              await send(`/inventory/${encodeURIComponent(item._id)}`, "DELETE");
              setItems((current) => current.filter((entry) => entry._id !== item._id));
              if (editing?._id === item._id) setModalVisible(false);
            } catch (error) {
              Alert.alert(
                "Could not delete item",
                error instanceof Error ? error.message : "Please try again.",
              );
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  if (loading) {
    return <ActivityIndicator style={{ flex: 1 }} size="large" color={colors.ink} />;
  }

  return (
    <View style={s.screen}>
      <ScrollView
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load(true)}
            tintColor={colors.ink}
          />
        }
      >
        <View style={s.hero}>
          <View style={s.heroTop}>
            <View style={s.heroIcon}>
              <Ionicons name="cube-outline" size={24} color="#fff" />
            </View>
            {canWrite && (
              <Pressable style={s.addButton} onPress={openCreate}>
                <Ionicons name="add" size={18} color={colors.ink} />
                <Text style={s.addButtonText}>Add Item</Text>
              </Pressable>
            )}
          </View>
          <Text style={s.eyebrow}>OPERATIONS</Text>
          <Text style={s.title}>Inventory</Text>
          <Text style={s.subtitle}>
            Track school supplies, lab equipment, sports gear and IT assets.
          </Text>
        </View>

        {!!loadError && (
          <Card style={s.errorCard}>
            <Ionicons name="cloud-offline-outline" size={25} color={colors.alert} />
            <Text style={s.errorText}>{loadError}</Text>
            <Pressable onPress={() => void load()}>
              <Text style={s.retryText}>Retry</Text>
            </Pressable>
          </Card>
        )}

        {!loadError && (
          <>
            <View style={s.statsGrid}>
              <StatCard
                icon="cube"
                label="Items tracked"
                value={stats.total}
                hint="All categories"
                color={colors.ink}
              />
              <StatCard
                icon="warning"
                label="Low stock"
                value={stats.low}
                hint="Needs restocking"
                color={colors.alert}
              />
              <StatCard
                icon="pricetags"
                label="Categories"
                value={stats.categories}
                hint="Active types"
                color={colors.info}
              />
              <StatCard
                icon="layers"
                label="Total units"
                value={stats.units}
                hint="Across all items"
                color={colors.success}
              />
            </View>

            <View style={s.listHeading}>
              <View>
                <Text style={s.sectionTitle}>Inventory List</Text>
                <Text style={s.sectionSubtitle}>
                  {filteredItems.length} of {items.length} items
                </Text>
              </View>
              <Pressable
                style={s.refreshButton}
                onPress={() => void load(true)}
                disabled={refreshing}
                accessibilityRole="button"
                accessibilityLabel="Refresh inventory"
              >
                {refreshing ? (
                  <ActivityIndicator size="small" color={colors.ink} />
                ) : (
                  <Ionicons name="refresh" size={18} color={colors.ink} />
                )}
              </Pressable>
            </View>

            <View style={s.searchBox}>
              <Ionicons name="search" size={17} color={colors.muted} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search item, category, supplier..."
                placeholderTextColor="#98A2B3"
                style={s.searchInput}
                autoCorrect={false}
              />
              {!!query && (
                <Pressable onPress={() => setQuery("")} hitSlop={8}>
                  <Ionicons name="close-circle" size={17} color={colors.muted} />
                </Pressable>
              )}
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.categoryRow}
            >
              {categories.map((category) => (
                <Pressable
                  key={category}
                  onPress={() => setCategoryFilter(category)}
                  style={[
                    s.categoryChip,
                    categoryFilter === category && s.categoryChipSelected,
                  ]}
                >
                  <Text
                    style={[
                      s.categoryChipText,
                      categoryFilter === category && s.categoryChipTextSelected,
                    ]}
                  >
                    {category === "All" ? "All Categories" : category}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {filteredItems.length === 0 ? (
              <Card style={s.emptyCard}>
                <View style={s.emptyIcon}>
                  <Ionicons name="file-tray-outline" size={28} color={colors.amberDark} />
                </View>
                <Text style={s.emptyTitle}>
                  {items.length ? "No matching items" : "No inventory items yet"}
                </Text>
                <Text style={s.emptyText}>
                  {items.length
                    ? "Try changing the search or category filter."
                    : "Add school supplies, equipment or other assets to start tracking stock."}
                </Text>
                {canWrite && !items.length && (
                  <View style={s.emptyButton}>
                    <Button title="Add First Item" onPress={openCreate} />
                  </View>
                )}
              </Card>
            ) : (
              filteredItems.map((item) => {
                const lowStock = item.quantity < item.reorderLevel;
                const stockRatio =
                  item.reorderLevel > 0
                    ? Math.min(1, item.quantity / (item.reorderLevel * 2))
                    : item.quantity > 0
                      ? 1
                      : 0;
                return (
                  <Card key={item._id} style={s.itemCard}>
                    <View style={s.itemTop}>
                      <View style={s.itemIcon}>
                        <Ionicons
                          name="cube"
                          size={19}
                          color={lowStock ? colors.alert : colors.amberDark}
                        />
                      </View>
                      <View style={s.itemInfo}>
                        <Text style={s.itemName}>{item.itemName}</Text>
                        <Text style={s.itemCategory}>{item.category}</Text>
                      </View>
                      <View style={[s.stockBadge, lowStock ? s.lowBadge : s.goodBadge]}>
                        <Text style={[s.stockBadgeText, lowStock ? s.lowText : s.goodText]}>
                          {lowStock ? "Reorder now" : "In stock"}
                        </Text>
                      </View>
                    </View>
                    <View style={s.stockSection}>
                      <View style={s.stockLabels}>
                        <Text style={s.stockLabel}>Current stock</Text>
                        <Text style={s.stockNumber}>
                          {item.quantity} {item.unit}
                        </Text>
                      </View>
                      <View style={s.progressTrack}>
                        <View
                          style={[
                            s.progressFill,
                            {
                              width: `${Math.round(stockRatio * 100)}%`,
                              backgroundColor: lowStock ? colors.alert : colors.success,
                            },
                          ]}
                        />
                      </View>
                    </View>
                    <View style={s.itemDetails}>
                      <Detail label="Reorder at" value={`${item.reorderLevel} ${item.unit}`} />
                      <Detail label="Last restocked" value={dateLabel(item.purchaseDate)} />
                      {!!item.supplier && <Detail label="Supplier" value={item.supplier} />}
                    </View>
                    {canWrite && (
                      <View style={s.actions}>
                        <Pressable
                          style={[s.actionButton, s.increaseAction]}
                          onPress={() => void adjustStock(item, 1)}
                          disabled={busy}
                          accessibilityRole="button"
                          accessibilityLabel={`Add one ${item.unit} of ${item.itemName}`}
                        >
                          <Ionicons name="arrow-up" size={15} color="#15966A" />
                          <Text style={[s.actionText, { color: "#15966A" }]}>Add stock</Text>
                        </Pressable>
                        <Pressable
                          style={s.actionButton}
                          onPress={() => void adjustStock(item, -1)}
                          disabled={busy || item.quantity <= 0}
                          accessibilityRole="button"
                          accessibilityLabel={`Remove one ${item.unit} of ${item.itemName}`}
                        >
                          <Ionicons name="remove" size={16} color={colors.muted} />
                          <Text style={s.actionText}>Reduce</Text>
                        </Pressable>
                        <Pressable
                          style={s.iconAction}
                          onPress={() => openEdit(item)}
                          accessibilityRole="button"
                          accessibilityLabel={`Edit ${item.itemName}`}
                        >
                          <Ionicons name="create-outline" size={17} color={colors.info} />
                        </Pressable>
                        <Pressable
                          style={s.iconAction}
                          onPress={() => remove(item)}
                          accessibilityRole="button"
                          accessibilityLabel={`Delete ${item.itemName}`}
                        >
                          <Ionicons name="trash-outline" size={17} color={colors.alert} />
                        </Pressable>
                      </View>
                    )}
                  </Card>
                );
              })
            )}
            {!canWrite && (
              <Text style={s.readOnlyNote}>
                Read-only access. Contact your school administrator to manage stock.
              </Text>
            )}
          </>
        )}
      </ScrollView>

      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => !busy && setModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={s.modalBackdrop}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={s.modalCard}>
            <View style={s.modalHeader}>
              <View>
                <Text style={s.modalTitle}>{editing ? "Edit Item" : "Add Item"}</Text>
                <Text style={s.modalSubtitle}>
                  {editing ? "Update inventory item details." : "Add a new inventory item."}
                </Text>
              </View>
              <Pressable
                onPress={() => setModalVisible(false)}
                disabled={busy}
                hitSlop={10}
              >
                <Ionicons name="close" size={23} color={colors.muted} />
              </Pressable>
            </View>
            <ScrollView
              style={s.formScroll}
              contentContainerStyle={s.formFields}
              keyboardShouldPersistTaps="handled"
            >
              <View style={s.fieldWrap}>
                <Text style={s.fieldLabel}>ITEM NAME *</Text>
                <TextInput
                  value={form.itemName}
                  onChangeText={(itemName) => setForm((current) => ({ ...current, itemName }))}
                  editable={!busy}
                  placeholder="e.g. Science lab beakers"
                  placeholderTextColor="#98A2B3"
                  style={s.input}
                  maxLength={120}
                />
              </View>
              <View style={s.fieldWrap}>
                <Text style={s.fieldLabel}>CATEGORY</Text>
                <Pressable
                  style={s.selectField}
                  onPress={() =>
                    setPicker({
                      title: "Select category",
                      values: CATEGORIES,
                      onSelect: (category) => setForm((current) => ({ ...current, category })),
                    })
                  }
                  disabled={busy}
                >
                  <Text style={s.selectValue}>{form.category}</Text>
                  <Ionicons name="chevron-down" size={17} color={colors.muted} />
                </Pressable>
              </View>
              <View style={s.numberRow}>
                <View style={s.numberField}>
                  <Text style={s.fieldLabel}>STOCK</Text>
                  <TextInput
                    value={form.quantity}
                    onChangeText={(quantity) => setForm((current) => ({ ...current, quantity }))}
                    editable={!busy}
                    placeholder="0"
                    placeholderTextColor="#98A2B3"
                    keyboardType="decimal-pad"
                    style={s.input}
                  />
                </View>
                <View style={s.numberField}>
                  <Text style={s.fieldLabel}>REORDER LEVEL</Text>
                  <TextInput
                    value={form.reorderLevel}
                    onChangeText={(reorderLevel) =>
                      setForm((current) => ({ ...current, reorderLevel }))
                    }
                    editable={!busy}
                    placeholder="0"
                    placeholderTextColor="#98A2B3"
                    keyboardType="decimal-pad"
                    style={s.input}
                  />
                </View>
              </View>
              <View style={s.fieldWrap}>
                <Text style={s.fieldLabel}>UNIT</Text>
                <Pressable
                  style={s.selectField}
                  onPress={() =>
                    setPicker({
                      title: "Select unit",
                      values: UNITS,
                      onSelect: (unit) => setForm((current) => ({ ...current, unit })),
                    })
                  }
                  disabled={busy}
                >
                  <Text style={s.selectValue}>{form.unit}</Text>
                  <Ionicons name="chevron-down" size={17} color={colors.muted} />
                </Pressable>
              </View>
              <View style={s.fieldWrap}>
                <Text style={s.fieldLabel}>SUPPLIER (OPTIONAL)</Text>
                <TextInput
                  value={form.supplier}
                  onChangeText={(supplier) => setForm((current) => ({ ...current, supplier }))}
                  editable={!busy}
                  placeholder="Supplier or vendor"
                  placeholderTextColor="#98A2B3"
                  style={s.input}
                  maxLength={120}
                />
              </View>
              <View style={s.fieldWrap}>
                <Text style={s.fieldLabel}>LAST RESTOCKED</Text>
                <TextInput
                  value={form.purchaseDate}
                  onChangeText={(purchaseDate) =>
                    setForm((current) => ({ ...current, purchaseDate }))
                  }
                  editable={!busy}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#98A2B3"
                  keyboardType="numbers-and-punctuation"
                  maxLength={10}
                  style={s.input}
                />
              </View>
            </ScrollView>
            <View style={s.modalActions}>
              {editing ? (
                <Pressable
                  style={s.deleteButton}
                  onPress={() => remove(editing)}
                  disabled={busy}
                >
                  <Ionicons name="trash-outline" size={17} color={colors.alert} />
                  <Text style={s.deleteButtonText}>Delete</Text>
                </Pressable>
              ) : <View />}
              <View style={s.modalRightActions}>
                <Pressable
                  style={s.cancelButton}
                  onPress={() => setModalVisible(false)}
                  disabled={busy}
                >
                  <Text style={s.cancelText}>Cancel</Text>
                </Pressable>
                <View style={s.saveButton}>
                  <Button
                    title={busy ? "Saving..." : editing ? "Update Item" : "Add Item"}
                    onPress={() => void save()}
                    loading={busy}
                  />
                </View>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      <CategoryPicker picker={picker} onClose={() => setPicker(null)} />
    </View>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
  color,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: number;
  hint: string;
  color: string;
}) {
  return (
    <Card style={s.statCard}>
      <View style={[s.statIcon, { backgroundColor: `${color}16` }]}>
        <Ionicons name={icon} size={17} color={color} />
      </View>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={[s.statValue, { color }]}>{value}</Text>
      <Text style={s.statHint}>{hint}</Text>
    </Card>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.detailBlock}>
      <Text style={s.detailLabel}>{label}</Text>
      <Text style={s.detailValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 16, paddingBottom: 32, gap: 13 },
  hero: { padding: 20, borderRadius: 20, backgroundColor: colors.ink },
  heroTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heroIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.16)", alignItems: "center", justifyContent: "center", marginBottom: 14 },
  addButton: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 10, backgroundColor: "#fff", paddingHorizontal: 11, paddingVertical: 8 },
  addButtonText: { color: colors.ink, fontSize: 10, fontWeight: "800" },
  eyebrow: { color: "#FFD58A", fontSize: 10, fontWeight: "800", letterSpacing: 1.5 },
  title: { color: "#fff", fontSize: 23, fontWeight: "800", marginTop: 4 },
  subtitle: { color: "rgba(255,255,255,0.76)", fontSize: 12, lineHeight: 18, marginTop: 5 },
  errorCard: { alignItems: "center", gap: 9 },
  errorText: { color: colors.alert, fontSize: 11, textAlign: "center", lineHeight: 16 },
  retryText: { color: colors.info, fontSize: 12, fontWeight: "800" },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statCard: { width: "48%", minHeight: 130, padding: 12, gap: 4 },
  statIcon: { width: 31, height: 31, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 2 },
  statLabel: { color: colors.muted, fontSize: 9, fontWeight: "700" },
  statValue: { fontSize: 23, fontWeight: "800" },
  statHint: { color: colors.muted, fontSize: 9 },
  listHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 3 },
  sectionTitle: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  sectionSubtitle: { color: colors.muted, fontSize: 10, marginTop: 3 },
  refreshButton: { width: 36, height: 36, borderRadius: 11, backgroundColor: "#fff", borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  searchBox: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 11, backgroundColor: "#fff", paddingHorizontal: 11 },
  searchInput: { flex: 1, color: colors.ink, fontSize: 11, paddingVertical: 9 },
  categoryRow: { gap: 7, paddingVertical: 1 },
  categoryChip: { borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: "#fff", paddingHorizontal: 10, paddingVertical: 7 },
  categoryChipSelected: { backgroundColor: colors.ink, borderColor: colors.ink },
  categoryChipText: { color: colors.muted, fontSize: 9, fontWeight: "700" },
  categoryChipTextSelected: { color: "#fff" },
  emptyCard: { alignItems: "center", gap: 9, padding: 21 },
  emptyIcon: { width: 52, height: 52, borderRadius: 17, backgroundColor: "#FFF4DF", alignItems: "center", justifyContent: "center" },
  emptyTitle: { color: colors.ink, fontSize: 13, fontWeight: "800", textAlign: "center" },
  emptyText: { color: colors.muted, fontSize: 11, textAlign: "center", lineHeight: 16 },
  emptyButton: { width: "100%", marginTop: 3 },
  itemCard: { gap: 11, padding: 13 },
  itemTop: { flexDirection: "row", alignItems: "center", gap: 9 },
  itemIcon: { width: 39, height: 39, borderRadius: 12, backgroundColor: "#FFF4DF", alignItems: "center", justifyContent: "center" },
  itemInfo: { flex: 1 },
  itemName: { color: colors.ink, fontSize: 13, fontWeight: "800" },
  itemCategory: { color: colors.muted, fontSize: 10, marginTop: 3 },
  stockBadge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5 },
  lowBadge: { backgroundColor: "#FDECEC" },
  goodBadge: { backgroundColor: "#E8F7EF" },
  stockBadgeText: { fontSize: 8, fontWeight: "800" },
  lowText: { color: colors.alert },
  goodText: { color: "#15966A" },
  stockSection: { gap: 6 },
  stockLabels: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  stockLabel: { color: colors.muted, fontSize: 9 },
  stockNumber: { color: colors.ink, fontSize: 11, fontWeight: "800" },
  progressTrack: { height: 5, borderRadius: 3, backgroundColor: "#EEF0F3", overflow: "hidden" },
  progressFill: { height: 5, borderRadius: 3 },
  itemDetails: { flexDirection: "row", flexWrap: "wrap", gap: 12, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingTop: 9 },
  detailBlock: { minWidth: "42%", flex: 1, gap: 3 },
  detailLabel: { color: colors.muted, fontSize: 8 },
  detailValue: { color: colors.ink, fontSize: 9, fontWeight: "700" },
  actions: { flexDirection: "row", alignItems: "center", gap: 6, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingTop: 9 },
  actionButton: { minHeight: 33, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, borderWidth: 1, borderColor: colors.border, borderRadius: 9, paddingHorizontal: 9 },
  increaseAction: { borderColor: "#B7E8CE", backgroundColor: "#F5FCF8" },
  actionText: { color: colors.muted, fontSize: 9, fontWeight: "700" },
  iconAction: { width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: 9, backgroundColor: "#F7F8FA", marginLeft: "auto" },
  readOnlyNote: { color: colors.muted, fontSize: 10, textAlign: "center", lineHeight: 15, paddingHorizontal: 12 },
  modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(12,20,35,0.45)" },
  modalCard: { maxHeight: "92%", backgroundColor: colors.card, borderTopLeftRadius: 23, borderTopRightRadius: 23, paddingTop: 18, paddingHorizontal: 18, paddingBottom: 25 },
  modalHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  modalTitle: { color: colors.ink, fontSize: 17, fontWeight: "800" },
  modalSubtitle: { color: colors.muted, fontSize: 10, marginTop: 4 },
  formScroll: { flexGrow: 0 },
  formFields: { gap: 14, paddingVertical: 16 },
  fieldWrap: { gap: 6 },
  fieldLabel: { color: colors.muted, fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  input: { minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: 11, backgroundColor: "#fff", paddingHorizontal: 12, color: colors.ink, fontSize: 12 },
  numberRow: { flexDirection: "row", gap: 10 },
  numberField: { flex: 1, gap: 6 },
  selectField: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: colors.border, borderRadius: 11, backgroundColor: "#fff", paddingHorizontal: 12 },
  selectValue: { color: colors.ink, fontSize: 12, fontWeight: "600" },
  modalActions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingTop: 12 },
  modalRightActions: { flexDirection: "row", alignItems: "center", gap: 7 },
  deleteButton: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 7, paddingVertical: 9 },
  deleteButtonText: { color: colors.alert, fontSize: 10, fontWeight: "700" },
  cancelButton: { minHeight: 42, justifyContent: "center", paddingHorizontal: 9 },
  cancelText: { color: colors.muted, fontSize: 11, fontWeight: "700" },
  saveButton: { minWidth: 105 },
  pickerCard: { maxHeight: "75%", backgroundColor: colors.card, borderTopLeftRadius: 23, borderTopRightRadius: 23, paddingTop: 18, paddingHorizontal: 18, paddingBottom: 24 },
  pickerRow: { minHeight: 47, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  pickerText: { color: colors.ink, fontSize: 12, fontWeight: "600" },
});
