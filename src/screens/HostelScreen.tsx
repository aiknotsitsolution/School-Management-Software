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

const WINGS = ["Boys", "Girls"] as const;
const BLOCKS = ["A", "B", "C", "D"];
const WING_FILTERS = ["All", ...WINGS] as const;

type Wing = (typeof WINGS)[number];
type HostelRoom = {
  _id: string;
  roomNo: string;
  block: string;
  floor: number;
  wing: string;
  capacity: number;
  occupants: string[];
  warden?: string;
};
type StudentChoice = {
  id: string;
  name: string;
  admissionNo: string;
  gender?: string;
  class?: string;
  section?: string;
};
type RoomForm = { block: string; floor: string; wing: Wing; capacity: string };
type PickerState = {
  title: string;
  values: string[];
  onSelect: (value: string) => void;
} | null;

function isRecord(value: unknown): value is Row {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function responseRows(value: unknown): Row[] {
  if (Array.isArray(value)) return value.filter(isRecord);
  if (!isRecord(value)) return [];
  if (Array.isArray(value.data)) return value.data.filter(isRecord);
  if (Array.isArray(value.rooms)) return value.rooms.filter(isRecord);
  if (Array.isArray(value.students)) return value.students.filter(isRecord);
  return [];
}

function parseRoom(value: Row): HostelRoom {
  if (
    typeof value._id !== "string" ||
    typeof value.roomNo !== "string" ||
    typeof value.block !== "string" ||
    !Number.isFinite(Number(value.capacity))
  ) {
    throw new Error("A hostel room is missing required room or capacity details.");
  }
  const occupants = Array.isArray(value.occupants)
    ? value.occupants.map((occupant) =>
        typeof occupant === "string" ? occupant : String(occupant),
      )
    : [];
  return {
    _id: value._id,
    roomNo: value.roomNo,
    block: value.block,
    floor: Number(value.floor) || 1,
    wing: typeof value.wing === "string" ? value.wing : "Boys",
    capacity: Number(value.capacity),
    occupants,
    warden: typeof value.warden === "string" ? value.warden : "",
  };
}

function fullName(student: Row) {
  if (typeof student.name === "string" && student.name.trim()) {
    return student.name.trim();
  }
  const firstName =
    typeof student.firstName === "string" ? student.firstName.trim() : "";
  const lastName =
    typeof student.lastName === "string" ? student.lastName.trim() : "";
  return [firstName, lastName].filter(Boolean).join(" ") || "Student";
}

function studentChoices(value: unknown): StudentChoice[] {
  return responseRows(value)
    .filter((row) => typeof row._id === "string")
    .map((row) => {
      const admissionNo =
        typeof row.admissionNo === "string" && row.admissionNo
          ? row.admissionNo
          : (row._id as string);
      return {
        id: row._id as string,
        admissionNo,
        name: fullName(row),
        gender: typeof row.gender === "string" ? row.gender : undefined,
        class: typeof row.class === "string" ? row.class : undefined,
        section: typeof row.section === "string" ? row.section : undefined,
      };
    });
}

function roomForm(wing: Wing = "Boys"): RoomForm {
  return { block: "A", floor: "1", wing, capacity: "3" };
}

function getNextRoomNo(rooms: HostelRoom[]) {
  const highest = rooms.reduce((max, room) => {
    const value = Number.parseInt(room.roomNo.replace(/\D/g, ""), 10);
    return Number.isFinite(value) ? Math.max(max, value) : max;
  }, 100);
  return `HR-${highest + 1}`;
}

function SelectField({
  label,
  value,
  placeholder,
  onPress,
}: {
  label: string;
  value: string;
  placeholder: string;
  onPress: () => void;
}) {
  return (
    <View style={s.fieldWrap}>
      <Text style={s.fieldLabel}>{label}</Text>
      <Pressable style={s.selectField} onPress={onPress}>
        <Text style={[s.selectValue, !value && s.placeholder]}>
          {value || placeholder}
        </Text>
        <Ionicons name="chevron-down" size={17} color={colors.muted} />
      </Pressable>
    </View>
  );
}

function SearchPicker({
  picker,
  onClose,
  search,
  onSearch,
}: {
  picker: PickerState;
  onClose: () => void;
  search: string;
  onSearch: (value: string) => void;
}) {
  const filtered = picker?.values.filter((value) =>
    value.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  );
  return (
    <Modal visible={!!picker} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.modalBackdrop}>
        <View style={s.pickerCard}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>{picker?.title}</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={23} color={colors.muted} />
            </Pressable>
          </View>
          <View style={s.pickerSearch}>
            <Ionicons name="search" size={17} color={colors.muted} />
            <TextInput
              value={search}
              onChangeText={onSearch}
              placeholder="Search..."
              placeholderTextColor="#98A2B3"
              style={s.pickerSearchInput}
              autoCorrect={false}
            />
          </View>
          <FlatList
            data={filtered || []}
            keyExtractor={(item) => item}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable
                style={s.pickerRow}
                onPress={() => {
                  picker?.onSelect(item);
                  onClose();
                }}
              >
                <Text style={s.pickerText}>{item}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.muted} />
              </Pressable>
            )}
            ListEmptyComponent={
              <Text style={s.pickerEmpty}>No matching options.</Text>
            }
          />
        </View>
      </View>
    </Modal>
  );
}

export default function HostelScreen() {
  const { can } = useAuth();
  const canManage = can("hostel:manage");
  const canReadStudents = can("students:read");
  const [rooms, setRooms] = useState<HostelRoom[]>([]);
  const [students, setStudents] = useState<StudentChoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [studentError, setStudentError] = useState("");
  const [wingFilter, setWingFilter] =
    useState<(typeof WING_FILTERS)[number]>("All");
  const [roomModal, setRoomModal] = useState(false);
  const [allotModal, setAllotModal] = useState(false);
  const [room, setRoom] = useState<RoomForm>(roomForm());
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [picker, setPicker] = useState<PickerState>(null);
  const [pickerSearch, setPickerSearch] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setLoadError("");
    setStudentError("");
    try {
      const [roomResult, studentResult] = await Promise.allSettled([
        get<unknown>("/hostel?limit=1000&page=1"),
        canReadStudents ? get<unknown>("/students?limit=1000&page=1") : Promise.resolve(null),
      ]);
      if (roomResult.status === "rejected") throw roomResult.reason;
      const roomRows = responseRows(roomResult.value.data);
      const totalPages = isRecord(roomResult.value) && typeof roomResult.value.pages === "number"
        ? Math.max(1, roomResult.value.pages)
        : 1;
      const additionalRooms = await Promise.all(
        Array.from({ length: totalPages - 1 }, (_, index) =>
          get<unknown>(`/hostel?limit=1000&page=${index + 2}`),
        ),
      );
      setRooms(
        [...roomRows, ...additionalRooms.flatMap((response) => responseRows(response.data))]
          .map(parseRoom),
      );
      if (studentResult.status === "fulfilled" && studentResult.value) {
        const result = studentResult.value;
        const studentRows = responseRows(result.data);
        const studentPages = isRecord(result) && typeof result.pages === "number"
          ? Math.max(1, result.pages)
          : 1;
        const additionalStudents = await Promise.all(
          Array.from({ length: studentPages - 1 }, (_, index) =>
            get<unknown>(`/students?limit=1000&page=${index + 2}`),
          ),
        );
        const rows = [
          ...studentRows,
          ...additionalStudents.flatMap((response) => responseRows(response.data)),
        ];
        setStudents(studentChoices(rows));
      } else if (studentResult.status === "rejected") {
        setStudentError(
          studentResult.reason instanceof Error
            ? studentResult.reason.message
            : "Could not load students.",
        );
      }
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Could not load hostel rooms.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [canReadStudents]);

  useEffect(() => {
    void load();
  }, [load]);

  const occupantNames = useMemo(() => {
    const names = new Map<string, string>();
    for (const student of students) {
      names.set(student.admissionNo, student.name);
      names.set(student.id, student.name);
    }
    return names;
  }, [students]);
  const totalStudents = rooms.reduce((total, item) => total + item.occupants.length, 0);
  const occupiedRooms = rooms.filter((item) => item.occupants.length > 0).length;
  const totalCapacity = rooms.reduce((total, item) => total + item.capacity, 0);
  const availableBeds = Math.max(0, totalCapacity - totalStudents);
  const filteredRooms = useMemo(
    () => rooms.filter((item) => wingFilter === "All" || item.wing === wingFilter),
    [rooms, wingFilter],
  );
  const housedStudentIds = useMemo(
    () => new Set(rooms.flatMap((item) => item.occupants)),
    [rooms],
  );
  const availableStudents = useMemo(
    () => students.filter((student) => !housedStudentIds.has(student.admissionNo) && !housedStudentIds.has(student.id)),
    [housedStudentIds, students],
  );
  const availableRooms = useMemo(
    () => rooms.filter((item) => item.occupants.length < item.capacity),
    [rooms],
  );

  const openRoomForm = () => {
    setRoom(roomForm(wingFilter === "Girls" ? "Girls" : "Boys"));
    setRoomModal(true);
  };

  const openAllotForm = (presetRoomId = "") => {
    if (!canReadStudents) {
      Alert.alert(
        "Student access required",
        "Your account needs students:read permission to select a student for a room.",
      );
      return;
    }
    if (!availableRooms.length) {
      Alert.alert("No vacant beds", "Add a room or move a student out before allotting a room.");
      return;
    }
    if (!availableStudents.length) {
      Alert.alert("No available students", "All loaded students are already allotted, or no students are available.");
      return;
    }
    setSelectedStudentId("");
    setSelectedRoomId(presetRoomId);
    setAllotModal(true);
  };

  const createRoom = async () => {
    if (!canManage || busy) return;
    const capacity = Number(room.capacity);
    const floor = Number(room.floor);
    if (!room.block.trim()) {
      Alert.alert("Block required", "Enter or select a hostel block.");
      return;
    }
    if (!Number.isInteger(floor) || floor < 1) {
      Alert.alert("Invalid floor", "Floor must be a positive whole number.");
      return;
    }
    if (!Number.isInteger(capacity) || capacity < 1) {
      Alert.alert("Invalid capacity", "Capacity must be a positive whole number.");
      return;
    }
    const roomNo = getNextRoomNo(rooms);
    setBusy(true);
    try {
      const response = await send<unknown>("/hostel", "POST", {
        roomNo,
        block: room.block.trim(),
        floor,
        wing: room.wing,
        capacity,
      });
      if (!isRecord(response.data)) throw new Error("The server did not return the created room.");
      setRooms((current) => [parseRoom(response.data as Row), ...current]);
      setRoomModal(false);
      Alert.alert("Room added", `${roomNo} is ready for student allotment.`);
    } catch (error) {
      Alert.alert("Could not add room", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const allotStudent = async () => {
    if (!canManage || busy) return;
    const targetRoom = rooms.find((item) => item._id === selectedRoomId);
    const student = students.find((item) => item.id === selectedStudentId);
    if (!targetRoom || !student) {
      Alert.alert("Details required", "Select both a student and a room.");
      return;
    }
    if (targetRoom.occupants.length >= targetRoom.capacity) {
      Alert.alert("Room is full", "Select a room with a vacant bed.");
      return;
    }
    if (housedStudentIds.has(student.admissionNo) || housedStudentIds.has(student.id)) {
      Alert.alert("Already allotted", "This student already has a hostel room.");
      return;
    }
    setBusy(true);
    try {
      const response = await send<unknown>(
        `/hostel/${encodeURIComponent(targetRoom._id)}/allot`,
        "PATCH",
        { studentId: student.admissionNo },
      );
      if (!isRecord(response.data)) throw new Error("The server did not return the updated room.");
      const updated = parseRoom(response.data as Row);
      setRooms((current) => current.map((item) => item._id === updated._id ? updated : item));
      setAllotModal(false);
      Alert.alert("Student allotted", `${student.name} allotted to room ${targetRoom.roomNo}.`);
    } catch (error) {
      Alert.alert("Could not allot student", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const vacateStudent = (targetRoom: HostelRoom, studentId: string) => {
    const studentName = occupantNames.get(studentId) || studentId;
    Alert.alert(
      "Move student out?",
      `Remove ${studentName} from room ${targetRoom.roomNo}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Move out",
          style: "destructive",
          onPress: async () => {
            if (!canManage || busy) return;
            setBusy(true);
            try {
              const response = await send<unknown>(
                `/hostel/${encodeURIComponent(targetRoom._id)}/vacate`,
                "PATCH",
                { studentId },
              );
              if (!isRecord(response.data)) throw new Error("The server did not return the updated room.");
              const updated = parseRoom(response.data as Row);
              setRooms((current) => current.map((item) => item._id === updated._id ? updated : item));
            } catch (error) {
              Alert.alert(
                "Could not move student out",
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

  const deleteRoom = (targetRoom: HostelRoom) => {
    if (!canManage || busy) return;
    if (targetRoom.occupants.length) {
      Alert.alert("Room is occupied", "Move all occupants out before deleting this room.");
      return;
    }
    Alert.alert(
      "Delete room?",
      `Delete room ${targetRoom.roomNo} in Block ${targetRoom.block}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            try {
              await send(`/hostel/${encodeURIComponent(targetRoom._id)}`, "DELETE");
              setRooms((current) => current.filter((item) => item._id !== targetRoom._id));
            } catch (error) {
              Alert.alert(
                "Could not delete room",
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

  const showPicker = (next: PickerState) => {
    setPickerSearch("");
    setPicker(next);
  };

  if (loading) {
    return <ActivityIndicator style={{ flex: 1 }} size="large" color={colors.ink} />;
  }

  return (
    <View style={s.screen}>
      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.ink} />
        }
      >
        <View style={s.hero}>
          <View style={s.heroTop}>
            <View style={s.heroIcon}>
              <Ionicons name="bed" size={23} color="#fff" />
            </View>
            {canManage && (
              <View style={s.heroActions}>
                <Pressable style={s.secondaryHeroButton} onPress={() => openAllotForm()}>
                  <Ionicons name="person-add" size={15} color="#fff" />
                  <Text style={s.secondaryHeroText}>Allot</Text>
                </Pressable>
                <Pressable style={s.heroButton} onPress={openRoomForm}>
                  <Ionicons name="add" size={18} color={colors.ink} />
                  <Text style={s.heroButtonText}>Add Room</Text>
                </Pressable>
              </View>
            )}
          </View>
          <Text style={s.eyebrow}>OPERATIONS</Text>
          <Text style={s.title}>Hostel Management</Text>
          <Text style={s.subtitle}>Manage hostel rooms, student allotments and available beds.</Text>
        </View>

        {!!loadError && (
          <Card style={s.errorCard}>
            <Ionicons name="cloud-offline-outline" size={24} color={colors.alert} />
            <Text style={s.errorText}>{loadError}</Text>
            <Pressable onPress={() => void load()}>
              <Text style={s.retryText}>Retry</Text>
            </Pressable>
          </Card>
        )}

        {!!studentError && (
          <Card style={s.warningCard}>
            <Ionicons name="information-circle-outline" size={20} color={colors.info} />
            <Text style={s.warningText}>
              Student list unavailable: {studentError}
            </Text>
          </Card>
        )}

        {!loadError && (
          <>
            <View style={s.summaryGrid}>
              <SummaryCard label="Hostel students" value={totalStudents} icon="people" color={colors.ink} />
              <SummaryCard label="Occupied rooms" value={`${occupiedRooms}/${rooms.length}`} icon="bed" color={colors.info} />
              <SummaryCard label="Total capacity" value={totalCapacity} icon="business" color={colors.success} />
              <SummaryCard label="Vacant beds" value={availableBeds} icon="log-out-outline" color={colors.amberDark} />
            </View>

            <View style={s.filterRow}>
              {WING_FILTERS.map((wing) => (
                <Pressable
                  key={wing}
                  onPress={() => setWingFilter(wing)}
                  style={[s.filterChip, wingFilter === wing && s.filterChipActive]}
                >
                  <Text style={[s.filterText, wingFilter === wing && s.filterTextActive]}>
                    {wing === "All" ? "All Wings" : wing}
                  </Text>
                </Pressable>
              ))}
              <Pressable
                style={s.refreshButton}
                onPress={() => void load(true)}
                disabled={refreshing}
                accessibilityRole="button"
                accessibilityLabel="Refresh hostel rooms"
              >
                {refreshing ? <ActivityIndicator size="small" color={colors.ink} /> : <Ionicons name="refresh" size={17} color={colors.ink} />}
              </Pressable>
            </View>

            <View style={s.roomsHeading}>
              <View>
                <Text style={s.sectionTitle}>Hostel Rooms</Text>
                <Text style={s.sectionSubtitle}>{filteredRooms.length} rooms · {wingFilter === "All" ? "all wings" : `${wingFilter} wing`}</Text>
              </View>
              {canManage && (
                <Pressable style={s.addRoomSmall} onPress={openRoomForm}>
                  <Ionicons name="add" size={16} color={colors.ink} />
                  <Text style={s.addRoomSmallText}>Add room</Text>
                </Pressable>
              )}
            </View>

            {!filteredRooms.length ? (
              <Card style={s.emptyCard}>
                <View style={s.emptyIcon}>
                  <Ionicons name="bed-outline" size={28} color={colors.amberDark} />
                </View>
                <Text style={s.emptyTitle}>{rooms.length ? "No rooms in this wing" : "No hostel rooms yet"}</Text>
                <Text style={s.emptyText}>
                  {rooms.length ? "Choose another wing to see rooms." : "Add hostel rooms to start managing capacity and student allotments."}
                </Text>
                {canManage && !rooms.length && (
                  <View style={s.emptyButton}><Button title="Add First Room" onPress={openRoomForm} /></View>
                )}
              </Card>
            ) : (
              filteredRooms.map((targetRoom) => {
                const vacant = Math.max(0, targetRoom.capacity - targetRoom.occupants.length);
                const full = vacant === 0;
                return (
                  <Card key={targetRoom._id} style={s.roomCard}>
                    <View style={s.roomHeader}>
                      <View style={s.roomIcon}>
                        <Ionicons name="bed" size={19} color={colors.amberDark} />
                      </View>
                      <View style={s.roomInfo}>
                        <Text style={s.roomNumber}>{targetRoom.roomNo}</Text>
                        <Text style={s.roomMeta}>
                          Block {targetRoom.block} · Floor {targetRoom.floor} · {targetRoom.wing}
                        </Text>
                      </View>
                      <View style={[s.vacancyBadge, full ? s.fullBadge : s.availableBadge]}>
                        <Text style={[s.vacancyText, full ? s.fullText : s.availableText]}>
                          {full ? "Full" : `${vacant} vacant`}
                        </Text>
                      </View>
                    </View>
                    <View style={s.occupantsHeader}>
                      <Text style={s.occupantsTitle}>Occupants</Text>
                      <Text style={s.occupantsCount}>{targetRoom.occupants.length}/{targetRoom.capacity}</Text>
                    </View>
                    {targetRoom.occupants.length === 0 ? (
                      <View style={s.noOccupants}>
                        <Ionicons name="person-outline" size={16} color={colors.muted} />
                        <Text style={s.noOccupantsText}>No occupants</Text>
                      </View>
                    ) : (
                      targetRoom.occupants.map((studentId) => (
                        <View key={studentId} style={s.occupantRow}>
                          <View style={s.occupantAvatar}>
                            <Ionicons name="person" size={14} color={colors.info} />
                          </View>
                          <View style={s.occupantInfo}>
                            <Text style={s.occupantName}>{occupantNames.get(studentId) || studentId}</Text>
                            <Text style={s.occupantId}>ID: {studentId}</Text>
                          </View>
                          {canManage && (
                            <Pressable
                              style={s.moveOutButton}
                              onPress={() => vacateStudent(targetRoom, studentId)}
                              disabled={busy}
                            >
                              <Text style={s.moveOutText}>Move out</Text>
                            </Pressable>
                          )}
                        </View>
                      ))
                    )}
                    {canManage && (
                      <View style={s.roomActions}>
                        {!full && canReadStudents && (
                          <Pressable
                            style={s.allotButton}
                            onPress={() => {
                              openAllotForm(targetRoom._id);
                            }}
                          >
                            <Ionicons name="person-add-outline" size={15} color={colors.info} />
                            <Text style={s.allotButtonText}>Allot student</Text>
                          </Pressable>
                        )}
                        <Pressable
                          style={s.deleteButton}
                          onPress={() => deleteRoom(targetRoom)}
                          disabled={busy}
                          accessibilityRole="button"
                          accessibilityLabel={`Delete room ${targetRoom.roomNo}`}
                        >
                          <Ionicons name="trash-outline" size={16} color={colors.alert} />
                        </Pressable>
                      </View>
                    )}
                  </Card>
                );
              })
            )}
            {!canManage && (
              <Text style={s.readOnlyNote}>Read-only access. Contact a hostel administrator to manage rooms and allotments.</Text>
            )}
          </>
        )}
      </ScrollView>

      <Modal visible={roomModal} transparent animationType="slide" onRequestClose={() => !busy && setRoomModal(false)}>
        <KeyboardAvoidingView style={s.modalBackdrop} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={s.modalCard}>
            <View style={s.modalHeader}>
              <View>
                <Text style={s.modalTitle}>Add Hostel Room</Text>
                <Text style={s.modalSubtitle}>Set room block, floor, wing and bed capacity.</Text>
              </View>
              <Pressable onPress={() => setRoomModal(false)} disabled={busy} hitSlop={10}>
                <Ionicons name="close" size={23} color={colors.muted} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={s.formFields} keyboardShouldPersistTaps="handled">
              <View style={s.formRow}>
                <View style={s.formColumn}>
                  <Text style={s.fieldLabel}>BLOCK *</Text>
                  <TextInput
                    value={room.block}
                    onChangeText={(block) => setRoom((current) => ({ ...current, block }))}
                    editable={!busy}
                    placeholder="e.g. A"
                    placeholderTextColor="#98A2B3"
                    style={s.input}
                  />
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.quickOptions}>
                    {BLOCKS.map((block) => (
                      <Pressable key={block} style={[s.quickChip, room.block === block && s.quickChipSelected]} onPress={() => setRoom((current) => ({ ...current, block }))}>
                        <Text style={[s.quickChipText, room.block === block && s.quickChipTextSelected]}>{block}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
                <View style={s.formColumn}>
                  <Text style={s.fieldLabel}>FLOOR *</Text>
                  <TextInput
                    value={room.floor}
                    onChangeText={(floor) => setRoom((current) => ({ ...current, floor }))}
                    editable={!busy}
                    placeholder="1"
                    placeholderTextColor="#98A2B3"
                    keyboardType="number-pad"
                    style={s.input}
                  />
                </View>
              </View>
              <SelectField
                label="WING"
                value={room.wing}
                placeholder="Select wing"
                onPress={() => showPicker({
                  title: "Select hostel wing",
                  values: [...WINGS],
                  onSelect: (value) => setRoom((current) => ({ ...current, wing: value as Wing })),
                })}
              />
              <View style={s.fieldWrap}>
                <Text style={s.fieldLabel}>BED CAPACITY *</Text>
                <TextInput
                  value={room.capacity}
                  onChangeText={(capacity) => setRoom((current) => ({ ...current, capacity }))}
                  editable={!busy}
                  placeholder="3"
                  placeholderTextColor="#98A2B3"
                  keyboardType="number-pad"
                  style={s.input}
                />
              </View>
              <Text style={s.roomNoHint}>Room number will be generated automatically: {getNextRoomNo(rooms)}</Text>
            </ScrollView>
            <View style={s.modalActions}>
              <Pressable style={s.cancelButton} onPress={() => setRoomModal(false)} disabled={busy}>
                <Text style={s.cancelText}>Cancel</Text>
              </Pressable>
              <View style={s.modalSubmit}><Button title={busy ? "Adding..." : "Add Room"} onPress={() => void createRoom()} loading={busy} /></View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={allotModal} transparent animationType="slide" onRequestClose={() => !busy && setAllotModal(false)}>
        <KeyboardAvoidingView style={s.modalBackdrop} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={s.modalCard}>
            <View style={s.modalHeader}>
              <View>
                <Text style={s.modalTitle}>Allot Hostel Room</Text>
                <Text style={s.modalSubtitle}>Select an unallotted student and a room with a vacant bed.</Text>
              </View>
              <Pressable onPress={() => setAllotModal(false)} disabled={busy} hitSlop={10}>
                <Ionicons name="close" size={23} color={colors.muted} />
              </Pressable>
            </View>
            <View style={s.formFields}>
              <SelectField
                label="STUDENT *"
                value={students.find((student) => student.id === selectedStudentId)?.name || ""}
                placeholder="Select student"
                onPress={() => showPicker({
                  title: "Select student",
                  values: availableStudents.map((student) => `${student.name} · ${student.admissionNo}`),
                  onSelect: (value) => {
                    const admissionNo = value.split(" · ").pop();
                    const student = availableStudents.find((item) => item.admissionNo === admissionNo);
                    setSelectedStudentId(student?.id || "");
                  },
                })}
              />
              <SelectField
                label="AVAILABLE ROOM *"
                value={rooms.find((item) => item._id === selectedRoomId)
                  ? `${rooms.find((item) => item._id === selectedRoomId)?.roomNo} · Block ${rooms.find((item) => item._id === selectedRoomId)?.block} · ${rooms.find((item) => item._id === selectedRoomId)?.wing}`
                  : ""}
                placeholder="Select room"
                onPress={() => showPicker({
                  title: "Select available room",
                  values: availableRooms.map((item) => `${item.roomNo} · Block ${item.block} · ${item.wing} · ${item.capacity - item.occupants.length} vacant`),
                  onSelect: (value) => {
                    const roomNo = value.split(" · ")[0];
                    const selected = availableRooms.find((item) => item.roomNo === roomNo);
                    setSelectedRoomId(selected?._id || "");
                  },
                })}
              />
            </View>
            <View style={s.modalActions}>
              <Pressable style={s.cancelButton} onPress={() => setAllotModal(false)} disabled={busy}>
                <Text style={s.cancelText}>Cancel</Text>
              </Pressable>
              <View style={s.modalSubmit}><Button title={busy ? "Allotting..." : "Allot Student"} onPress={() => void allotStudent()} loading={busy} /></View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      <SearchPicker
        picker={picker}
        onClose={() => setPicker(null)}
        search={pickerSearch}
        onSearch={setPickerSearch}
      />
    </View>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: string | number;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}) {
  return (
    <Card style={s.summaryCard}>
      <View style={[s.summaryIcon, { backgroundColor: `${color}18` }]}>
        <Ionicons name={icon} size={16} color={color} />
      </View>
      <Text style={s.summaryValue}>{value}</Text>
      <Text style={s.summaryLabel}>{label}</Text>
    </Card>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 16, paddingBottom: 32, gap: 13 },
  hero: { padding: 20, borderRadius: 20, backgroundColor: colors.ink },
  heroTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heroIcon: { width: 43, height: 43, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.16)", alignItems: "center", justifyContent: "center", marginBottom: 14 },
  heroActions: { flexDirection: "row", alignItems: "center", gap: 7 },
  secondaryHeroButton: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.14)", paddingHorizontal: 9, paddingVertical: 8 },
  secondaryHeroText: { color: "#fff", fontSize: 9, fontWeight: "800" },
  heroButton: { flexDirection: "row", alignItems: "center", gap: 3, borderRadius: 10, backgroundColor: "#fff", paddingHorizontal: 9, paddingVertical: 8 },
  heroButtonText: { color: colors.ink, fontSize: 9, fontWeight: "800" },
  eyebrow: { color: "#FFD58A", fontSize: 10, fontWeight: "800", letterSpacing: 1.5 },
  title: { color: "#fff", fontSize: 21, fontWeight: "800", marginTop: 4 },
  subtitle: { color: "rgba(255,255,255,0.76)", fontSize: 11, lineHeight: 17, marginTop: 5 },
  errorCard: { alignItems: "center", gap: 9 },
  errorText: { color: colors.alert, fontSize: 11, textAlign: "center", lineHeight: 16 },
  retryText: { color: colors.info, fontSize: 12, fontWeight: "800" },
  warningCard: { flexDirection: "row", alignItems: "center", gap: 8, padding: 11 },
  warningText: { flex: 1, color: colors.info, fontSize: 10, lineHeight: 15 },
  summaryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  summaryCard: { width: "48%", minHeight: 108, alignItems: "center", justifyContent: "center", padding: 10, gap: 4 },
  summaryIcon: { width: 30, height: 30, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  summaryValue: { color: colors.ink, fontSize: 19, fontWeight: "800" },
  summaryLabel: { color: colors.muted, fontSize: 9, textAlign: "center" },
  filterRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  filterChip: { borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: "#fff", paddingHorizontal: 10, paddingVertical: 7 },
  filterChipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  filterText: { color: colors.muted, fontSize: 9, fontWeight: "700" },
  filterTextActive: { color: "#fff" },
  refreshButton: { width: 34, height: 34, borderRadius: 10, backgroundColor: "#fff", borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", marginLeft: "auto" },
  roomsHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 2 },
  sectionTitle: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  sectionSubtitle: { color: colors.muted, fontSize: 10, marginTop: 3 },
  addRoomSmall: { flexDirection: "row", alignItems: "center", gap: 3, borderRadius: 9, backgroundColor: "#fff", borderWidth: 1, borderColor: colors.border, paddingHorizontal: 8, paddingVertical: 6 },
  addRoomSmallText: { color: colors.ink, fontSize: 9, fontWeight: "800" },
  emptyCard: { alignItems: "center", gap: 9, padding: 20 },
  emptyIcon: { width: 51, height: 51, borderRadius: 16, backgroundColor: "#FFF4DF", alignItems: "center", justifyContent: "center" },
  emptyTitle: { color: colors.ink, fontSize: 13, fontWeight: "800", textAlign: "center" },
  emptyText: { color: colors.muted, fontSize: 10, textAlign: "center", lineHeight: 15 },
  emptyButton: { width: "100%", marginTop: 3 },
  roomCard: { gap: 11, padding: 13 },
  roomHeader: { flexDirection: "row", alignItems: "center", gap: 9 },
  roomIcon: { width: 39, height: 39, borderRadius: 12, backgroundColor: "#FFF4DF", alignItems: "center", justifyContent: "center" },
  roomInfo: { flex: 1 },
  roomNumber: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  roomMeta: { color: colors.muted, fontSize: 9, marginTop: 3 },
  vacancyBadge: { borderRadius: 9, paddingHorizontal: 8, paddingVertical: 5 },
  fullBadge: { backgroundColor: "#FDECEC" },
  availableBadge: { backgroundColor: "#E8F7EF" },
  vacancyText: { fontSize: 8, fontWeight: "800" },
  fullText: { color: colors.alert },
  availableText: { color: "#15966A" },
  occupantsHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  occupantsTitle: { color: colors.ink, fontSize: 10, fontWeight: "800" },
  occupantsCount: { color: colors.muted, fontSize: 9, fontWeight: "700" },
  noOccupants: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, backgroundColor: colors.paper, borderRadius: 9, paddingVertical: 12 },
  noOccupantsText: { color: colors.muted, fontSize: 10 },
  occupantRow: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.paper, borderRadius: 9, paddingHorizontal: 9, paddingVertical: 8 },
  occupantAvatar: { width: 29, height: 29, borderRadius: 10, backgroundColor: "#EAF2FF", alignItems: "center", justifyContent: "center" },
  occupantInfo: { flex: 1 },
  occupantName: { color: colors.ink, fontSize: 10, fontWeight: "700" },
  occupantId: { color: colors.muted, fontSize: 8, marginTop: 2 },
  moveOutButton: { paddingHorizontal: 7, paddingVertical: 6 },
  moveOutText: { color: colors.alert, fontSize: 9, fontWeight: "800" },
  roomActions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingTop: 8 },
  allotButton: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 6 },
  allotButtonText: { color: colors.info, fontSize: 9, fontWeight: "800" },
  deleteButton: { width: 33, height: 31, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: "#FFF8F7" },
  readOnlyNote: { color: colors.muted, fontSize: 10, textAlign: "center", lineHeight: 15, paddingHorizontal: 12 },
  modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(12,20,35,0.45)" },
  modalCard: { maxHeight: "88%", backgroundColor: colors.card, borderTopLeftRadius: 23, borderTopRightRadius: 23, paddingTop: 18, paddingHorizontal: 18, paddingBottom: 25 },
  modalHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  modalTitle: { color: colors.ink, fontSize: 17, fontWeight: "800" },
  modalSubtitle: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 4 },
  formFields: { gap: 15, paddingVertical: 16 },
  formRow: { flexDirection: "row", gap: 10 },
  formColumn: { flex: 1, gap: 7 },
  fieldWrap: { gap: 6 },
  fieldLabel: { color: colors.muted, fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  input: { minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: 11, backgroundColor: "#fff", paddingHorizontal: 12, color: colors.ink, fontSize: 12 },
  quickOptions: { gap: 5 },
  quickChip: { minWidth: 26, alignItems: "center", borderRadius: 7, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 8, paddingVertical: 5 },
  quickChipSelected: { borderColor: colors.ink, backgroundColor: colors.ink },
  quickChipText: { color: colors.muted, fontSize: 9, fontWeight: "700" },
  quickChipTextSelected: { color: "#fff" },
  selectField: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: colors.border, borderRadius: 11, backgroundColor: "#fff", paddingHorizontal: 12 },
  selectValue: { color: colors.ink, fontSize: 12, fontWeight: "600" },
  placeholder: { color: "#98A2B3", fontWeight: "400" },
  roomNoHint: { color: colors.muted, fontSize: 10, lineHeight: 15 },
  modalActions: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingTop: 12 },
  cancelButton: { minHeight: 42, justifyContent: "center", paddingHorizontal: 10 },
  cancelText: { color: colors.muted, fontSize: 11, fontWeight: "700" },
  modalSubmit: { minWidth: 125 },
  pickerCard: { maxHeight: "78%", backgroundColor: colors.card, borderTopLeftRadius: 23, borderTopRightRadius: 23, paddingTop: 18, paddingHorizontal: 18, paddingBottom: 25 },
  pickerSearch: { minHeight: 42, flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: "#fff", paddingHorizontal: 10, marginVertical: 12 },
  pickerSearchInput: { flex: 1, color: colors.ink, fontSize: 11, paddingVertical: 8 },
  pickerRow: { minHeight: 46, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  pickerText: { color: colors.ink, fontSize: 11, fontWeight: "600" },
  pickerEmpty: { color: colors.muted, fontSize: 11, textAlign: "center", paddingVertical: 18 },
});
