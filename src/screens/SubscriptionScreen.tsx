import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "../components/UI";
import { api, API_BASE_URL, KEYS } from "../lib/api";
import { colors } from "../theme";
import type {
  PlatformPlan,
  SchoolSubscription,
  SchoolSubscriptionInvoice,
  SchoolSubscriptionUsage,
} from "../types";

const PAGE_SIZE = 10;
const usageLabels: Record<string, string> = {
  students: "Students",
  teachers: "Teachers",
  staff: "Staff",
  adminUsers: "Admin users",
};
const invoiceStatuses = ["", "paid", "issued", "overdue", "void"];

const formatMoney = (value?: number, currency = "INR") =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value || 0);

const formatDate = (value?: string) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

const daysUntil = (value?: string) => {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return null;
  return Math.max(0, Math.ceil((timestamp - Date.now()) / 86_400_000));
};

function StatusBadge({ status }: { status?: string }) {
  const tone =
    status === "active" || status === "paid"
      ? styles.statusSuccess
      : status === "trialing" || status === "issued"
        ? styles.statusInfo
        : status === "overdue" || status === "past_due" || status === "cancelled"
          ? styles.statusAlert
          : styles.statusNeutral;
  return (
    <Text style={[styles.statusBadge, tone]}>
      {(status || "unknown").replace(/_/g, " ")}
    </Text>
  );
}

function UsageMeter({
  label,
  used = 0,
  limit,
}: {
  label: string;
  used?: number;
  limit?: number | null;
}) {
  const unlimited = limit === null || limit === undefined;
  const overLimit = !unlimited && used > limit;
  const percent = unlimited ? 0 : Math.min(100, (used / Math.max(limit, 1)) * 100);
  return (
    <View style={styles.usageItem}>
      <View style={styles.usageCaption}>
        <Text style={styles.usageLabel}>{label}</Text>
        <Text style={[styles.usageValue, overLimit && styles.alertText]}>
          {used.toLocaleString("en-IN")}
          {unlimited ? " / Unlimited" : ` / ${limit?.toLocaleString("en-IN")}`}
        </Text>
      </View>
      <View style={styles.meterTrack}>
        <View
          style={[
            styles.meterFill,
            { width: `${percent}%` },
            overLimit && styles.meterOverLimit,
          ]}
        />
      </View>
    </View>
  );
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.dataRow}>
      <Text style={styles.dataLabel}>{label}</Text>
      <Text style={styles.dataValue}>{value || "—"}</Text>
    </View>
  );
}

export default function SubscriptionScreen() {
  const [subscription, setSubscription] = useState<SchoolSubscription | null>(null);
  const [scheduled, setScheduled] = useState<SchoolSubscription | null>(null);
  const [plans, setPlans] = useState<PlatformPlan[]>([]);
  const [usage, setUsage] = useState<SchoolSubscriptionUsage | null>(null);
  const [invoices, setInvoices] = useState<SchoolSubscriptionInvoice[]>([]);
  const [invoiceTotal, setInvoiceTotal] = useState(0);
  const [invoicePages, setInvoicePages] = useState(1);
  const [invoicePage, setInvoicePage] = useState(1);
  const [invoiceStatus, setInvoiceStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedPlan, setSelectedPlan] = useState<PlatformPlan | null>(null);
  const [detailPlan, setDetailPlan] = useState<PlatformPlan | null>(null);
  const [invoiceDetail, setInvoiceDetail] =
    useState<SchoolSubscriptionInvoice | null>(null);
  const [periods, setPeriods] = useState(1);
  const [upgrading, setUpgrading] = useState(false);
  const [downloading, setDownloading] = useState("");

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const [subResponse, scheduledResponse, plansResponse, usageResponse] =
        await Promise.all([
          api.schoolSubscription.me(),
          api.schoolSubscription.scheduled(),
          api.schoolSubscription.plans(),
          api.schoolSubscription.usage(),
        ]);
      setSubscription(subResponse.data || null);
      setScheduled(scheduledResponse.data || null);
      setPlans(plansResponse.data || []);
      setUsage(usageResponse.data || null);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load subscription information.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadInvoices = useCallback(async (page: number, status: string) => {
    setInvoiceLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
      });
      if (status) params.set("status", status);
      const response = await api.schoolSubscriptionInvoices.list(params.toString());
      setInvoices(response.data?.invoices || []);
      setInvoiceTotal(response.data?.total || 0);
      setInvoicePages(Math.max(1, response.data?.pages || 1));
      setInvoicePage(response.data?.page || page);
    } catch (loadError) {
      Alert.alert(
        "Invoices unavailable",
        loadError instanceof Error ? loadError.message : "Please try again.",
      );
    } finally {
      setInvoiceLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    void loadInvoices(1, "");
  }, [load, loadInvoices]);

  const currentPlan = useMemo(
    () =>
      plans.find((plan) => plan._id === subscription?.plan?._id) ||
      (subscription?.plan as PlatformPlan | undefined) ||
      null,
    [plans, subscription],
  );
  const trialDays = daysUntil(subscription?.trialEndDate);
  const paidPlan = Boolean(selectedPlan && Number(selectedPlan.price) > 0);

  const choosePlan = (plan: PlatformPlan) => {
    if (plan._id === subscription?.plan?._id) {
      Alert.alert("Current plan", "This is already your school's current plan.");
      return;
    }
    setSelectedPlan(plan);
    setPeriods(1);
  };

  const applyFreePlan = async () => {
    if (!selectedPlan || Number(selectedPlan.price) > 0) return;
    setUpgrading(true);
    try {
      const response = await api.schoolSubscription.upgrade(
        selectedPlan._id,
        periods,
        "immediate",
      );
      if ("requiresPayment" in response.data && response.data.requiresPayment) {
        throw new Error("The server requested payment for this plan. No changes were applied.");
      }
      setSelectedPlan(null);
      Alert.alert("Plan updated", response.message || "Your subscription was updated.");
      await Promise.all([load(true), loadInvoices(1, invoiceStatus)]);
    } catch (upgradeError) {
      Alert.alert(
        "Could not update plan",
        upgradeError instanceof Error ? upgradeError.message : "Please try again.",
      );
    } finally {
      setUpgrading(false);
    }
  };

  const openInvoice = async (invoice: SchoolSubscriptionInvoice) => {
    try {
      const response = await api.schoolSubscriptionInvoices.get(invoice._id);
      setInvoiceDetail(response.data);
    } catch (detailError) {
      Alert.alert(
        "Could not open invoice",
        detailError instanceof Error ? detailError.message : "Please try again.",
      );
    }
  };

  const downloadInvoice = async (invoice: SchoolSubscriptionInvoice) => {
    const invoiceId = invoice._id;
    const fileSystemDirectory = FileSystem.cacheDirectory;
    if (!fileSystemDirectory) {
      Alert.alert("Download unavailable", "Temporary file storage is not available.");
      return;
    }
    setDownloading(invoiceId);
    try {
      const token = await AsyncStorage.getItem(KEYS.access);
      const name = (invoice.invoiceNumber || `invoice-${invoiceId}`)
        .replace(/[^\w.-]/g, "_");
      const destination = `${fileSystemDirectory}${name}.pdf`;
      const result = await FileSystem.downloadAsync(
        `${API_BASE_URL}/auth/school/me/invoices/${encodeURIComponent(invoiceId)}/pdf`,
        destination,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      if (result.status < 200 || result.status >= 300) {
        await FileSystem.deleteAsync(result.uri, { idempotent: true });
        throw new Error(
          result.status === 400
            ? "PDF is available for paid or issued invoices only."
            : "Could not download this invoice.",
        );
      }
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(result.uri, {
          mimeType: "application/pdf",
          dialogTitle: invoice.invoiceNumber || "Subscription invoice",
          UTI: "com.adobe.pdf",
        });
      } else {
        await Share.share({
          url: result.uri,
          title: invoice.invoiceNumber || "Subscription invoice",
        });
      }
    } catch (downloadError) {
      Alert.alert(
        "Invoice download failed",
        downloadError instanceof Error ? downloadError.message : "Please try again.",
      );
    } finally {
      setDownloading("");
    }
  };

  const confirmPlanSelection = () => {
    if (!selectedPlan) return;
    if (paidPlan) {
      Alert.alert(
        "Secure payment required",
        "Paid-plan checkout is not available in the mobile app yet. Your current plan will not change. Please complete the upgrade through your school billing portal or contact the platform administrator.",
      );
      return;
    }
    Alert.alert(
      "Activate this plan?",
      `Switch to ${selectedPlan.name}${subscription ? " now? Your current plan will be replaced." : "?"}`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Continue", onPress: () => void applyFreePlan() },
      ],
    );
  };

  if (loading) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator size="large" color={colors.ink} />
        <Text style={styles.muted}>Loading subscription…</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />
        }
      >
        <View style={styles.heading}>
          <View style={styles.headingIcon}>
            <Ionicons name="card" size={22} color={colors.ink} />
          </View>
          <View style={styles.headingCopy}>
            <Text style={styles.eyebrow}>SCHOOL ADMINISTRATION</Text>
            <Text style={styles.title}>Subscription</Text>
            <Text style={styles.subtitle}>Plan, usage, invoices and upgrades</Text>
          </View>
        </View>

        {!!error && (
          <Card style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={() => void load()} style={styles.retryButton}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </Card>
        )}

        <Card style={styles.sectionCard}>
          <View style={styles.sectionHeading}>
            <View>
              <Text style={styles.sectionTitle}>Current plan</Text>
              <Text style={styles.sectionSubtitle}>Your school's active subscription</Text>
            </View>
            {subscription ? <StatusBadge status={subscription.status} /> : null}
          </View>
          {subscription ? (
            <>
              <View style={styles.currentPlan}>
                <View style={styles.currentPlanCopy}>
                  <Text style={styles.planName}>
                    {subscription.plan?.name || "Subscription"}
                  </Text>
                  <Text style={styles.planCode}>{subscription.plan?.code || "—"}</Text>
                </View>
                <Text style={styles.currentPrice}>
                  {formatMoney(subscription.price, subscription.currency)}
                  <Text style={styles.priceCycle}> / {subscription.billingCycle || "—"}</Text>
                </Text>
              </View>
              <View style={styles.dataGrid}>
                <DataRow label="Started" value={formatDate(subscription.startDate)} />
                <DataRow
                  label="Current period"
                  value={
                    subscription.currentPeriodStart && subscription.currentPeriodEnd
                      ? `${formatDate(subscription.currentPeriodStart)} – ${formatDate(
                          subscription.currentPeriodEnd,
                        )}`
                      : "—"
                  }
                />
                <DataRow label="Next billing" value={formatDate(subscription.nextBillingDate)} />
                <DataRow label="Trial ends" value={formatDate(subscription.trialEndDate)} />
              </View>
              {subscription.status === "trialing" && subscription.trialEndDate ? (
                <View style={styles.trialBanner}>
                  <Ionicons name="time-outline" size={19} color={colors.info} />
                  <Text style={styles.trialText}>
                    {trialDays === 0
                      ? `Trial ended ${formatDate(subscription.trialEndDate)}`
                      : `${trialDays} day${trialDays === 1 ? "" : "s"} left in your trial`}
                  </Text>
                </View>
              ) : null}
              <View style={styles.divider} />
              <Text style={styles.subheading}>Included features</Text>
              {currentPlan?.features?.length ? (
                currentPlan.features.map((feature, index) => (
                  <View key={`${feature}-${index}`} style={styles.featureRow}>
                    <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                    <Text style={styles.featureText}>{feature}</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.muted}>No feature details are available.</Text>
              )}
              <View style={styles.divider} />
              <Text style={styles.subheading}>Usage against plan limits</Text>
              <View style={styles.usageList}>
                {Object.entries(usageLabels).map(([key, label]) => (
                  <UsageMeter
                    key={key}
                    label={label}
                    used={usage?.[key as keyof SchoolSubscriptionUsage] || 0}
                    limit={currentPlan?.limits?.[key]}
                  />
                ))}
              </View>
            </>
          ) : (
            <View style={styles.emptySubscription}>
              <Ionicons name="card-outline" size={30} color={colors.muted} />
              <Text style={styles.emptyTitle}>No active subscription</Text>
              <Text style={styles.muted}>
                Review the plans below to see what is available for your school.
              </Text>
            </View>
          )}
        </Card>

        {scheduled?.plan ? (
          <Card style={styles.scheduledCard}>
            <View style={styles.sectionHeading}>
              <View style={styles.scheduledIcon}>
                <Ionicons name="calendar-outline" size={19} color={colors.info} />
              </View>
              <View style={styles.currentPlanCopy}>
                <Text style={styles.sectionTitle}>Scheduled upgrade</Text>
                <Text style={styles.sectionSubtitle}>{scheduled.plan.name}</Text>
              </View>
            </View>
            <DataRow label="Starts" value={formatDate(scheduled.startDate)} />
            <DataRow
              label="Duration"
              value={`${scheduled.durationPeriods || 1} ${
                scheduled.billingCycle === "yearly" ? "year(s)" : "month(s)"
              }`}
            />
            <DataRow
              label="Total"
              value={formatMoney(
                (scheduled.price || 0) * (scheduled.durationPeriods || 1),
                scheduled.currency,
              )}
            />
          </Card>
        ) : null}

        <View style={styles.plansHeading}>
          <View>
            <Text style={styles.sectionTitle}>Available plans</Text>
            <Text style={styles.sectionSubtitle}>Compare plans offered to your school</Text>
          </View>
        </View>
        {plans.length ? (
          plans.map((plan) => {
            const isCurrent = plan._id === subscription?.plan?._id;
            return (
              <Card key={plan._id} style={styles.planCard}>
                <View style={styles.planHeader}>
                  <View style={styles.currentPlanCopy}>
                    <Text style={styles.planName}>{plan.name}</Text>
                    <Text style={styles.planCode}>{plan.code}</Text>
                  </View>
                  {isCurrent ? <StatusBadge status="active" /> : null}
                </View>
                <View style={styles.planPriceRow}>
                  <Text style={styles.planPrice}>{formatMoney(plan.price, plan.currency)}</Text>
                  <Text style={styles.priceCycle}>/ {plan.billingCycle || "one-time"}</Text>
                  {plan.trialDays ? (
                    <Text style={styles.trialTag}>{plan.trialDays} day trial</Text>
                  ) : null}
                </View>
                <Text style={styles.planDescription}>
                  {plan.description || "No description provided."}
                </Text>
                {plan.features?.slice(0, 3).map((feature, index) => (
                  <View key={`${plan._id}-${index}`} style={styles.featureRow}>
                    <Ionicons name="checkmark" size={15} color={colors.success} />
                    <Text style={styles.featureText} numberOfLines={2}>
                      {feature}
                    </Text>
                  </View>
                ))}
                <View style={styles.planActions}>
                  <Pressable
                    style={styles.outlineButton}
                    onPress={() => setDetailPlan(plan)}
                  >
                    <Text style={styles.outlineButtonText}>View details</Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.primaryButton,
                      (isCurrent || upgrading) && styles.buttonDisabled,
                    ]}
                    disabled={isCurrent || upgrading}
                    onPress={() => choosePlan(plan)}
                  >
                    <Text style={styles.primaryButtonText}>
                      {isCurrent ? "Current plan" : "Choose plan"}
                    </Text>
                  </Pressable>
                </View>
              </Card>
            );
          })
        ) : (
          <Card style={styles.sectionCard}>
            <Text style={styles.muted}>No public plans are available right now.</Text>
          </Card>
        )}

        <Card style={styles.sectionCard}>
          <View style={styles.sectionHeading}>
            <View>
              <Text style={styles.sectionTitle}>Invoices & transactions</Text>
              <Text style={styles.sectionSubtitle}>
                {invoiceTotal.toLocaleString("en-IN")} invoice{invoiceTotal === 1 ? "" : "s"}
              </Text>
            </View>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.statusFilters}
          >
            {invoiceStatuses.map((status) => (
              <Pressable
                key={status || "all"}
                style={[
                  styles.filterPill,
                  invoiceStatus === status && styles.filterPillActive,
                ]}
                onPress={() => {
                  setInvoiceStatus(status);
                  void loadInvoices(1, status);
                }}
              >
                <Text
                  style={[
                    styles.filterText,
                    invoiceStatus === status && styles.filterTextActive,
                  ]}
                >
                  {status ? status.replace("_", " ") : "All"}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          {invoiceLoading ? (
            <ActivityIndicator color={colors.ink} style={styles.invoiceLoading} />
          ) : invoices.length ? (
            <View style={styles.invoiceList}>
              {invoices.map((invoice) => (
                <View key={invoice._id} style={styles.invoiceRow}>
                  <Pressable
                    style={styles.invoiceInfo}
                    onPress={() => void openInvoice(invoice)}
                  >
                    <Text style={styles.invoiceNumber}>
                      {invoice.invoiceNumber || "Invoice"}
                    </Text>
                    <Text style={styles.invoiceMeta}>
                      {invoice.planName || invoice.planCode || "Subscription"} ·{" "}
                      {formatDate(invoice.createdAt)}
                    </Text>
                    <Text style={styles.invoiceAmount}>
                      {formatMoney(invoice.totalAmount ?? invoice.amount, invoice.currency)}
                    </Text>
                  </Pressable>
                  <View style={styles.invoiceActions}>
                    <StatusBadge status={invoice.status} />
                    <Pressable
                      style={styles.iconButton}
                      onPress={() => void downloadInvoice(invoice)}
                      disabled={downloading === invoice._id}
                      accessibilityLabel={`Download ${invoice.invoiceNumber || "invoice"}`}
                    >
                      {downloading === invoice._id ? (
                        <ActivityIndicator size="small" color={colors.ink} />
                      ) : (
                        <Ionicons name="download-outline" size={18} color={colors.ink} />
                      )}
                    </Pressable>
                  </View>
                </View>
              ))}
              <View style={styles.pagination}>
                <Text style={styles.sectionSubtitle}>
                  Page {invoicePage} of {invoicePages}
                </Text>
                <View style={styles.pageControls}>
                  <Pressable
                    style={styles.pageButton}
                    disabled={invoicePage <= 1}
                    onPress={() => void loadInvoices(invoicePage - 1, invoiceStatus)}
                  >
                    <Ionicons
                      name="chevron-back"
                      size={16}
                      color={invoicePage <= 1 ? "#B8BEC8" : colors.ink}
                    />
                  </Pressable>
                  <Pressable
                    style={styles.pageButton}
                    disabled={invoicePage >= invoicePages}
                    onPress={() => void loadInvoices(invoicePage + 1, invoiceStatus)}
                  >
                    <Ionicons
                      name="chevron-forward"
                      size={16}
                      color={invoicePage >= invoicePages ? "#B8BEC8" : colors.ink}
                    />
                  </Pressable>
                </View>
              </View>
            </View>
          ) : (
            <Text style={styles.muted}>No invoices found for this filter.</Text>
          )}
        </Card>
      </ScrollView>

      <Modal
        visible={Boolean(selectedPlan)}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedPlan(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Choose {selectedPlan?.name}</Text>
                <Text style={styles.sectionSubtitle}>
                  {formatMoney(
                    (selectedPlan?.price || 0) * periods,
                    selectedPlan?.currency,
                  )}{" "}
                  total
                </Text>
              </View>
              <Pressable onPress={() => setSelectedPlan(null)} hitSlop={10}>
                <Ionicons name="close" size={23} color={colors.ink} />
              </Pressable>
            </View>
            <View style={styles.modalContent}>
              <Text style={styles.subheading}>
                Billing duration ({selectedPlan?.billingCycle === "yearly" ? "years" : "months"})
              </Text>
              <View style={styles.durationControl}>
                <Pressable
                  style={styles.durationButton}
                  disabled={periods <= 1}
                  onPress={() => setPeriods((value) => Math.max(1, value - 1))}
                >
                  <Ionicons name="remove" size={20} color={colors.ink} />
                </Pressable>
                <Text style={styles.durationValue}>{periods}</Text>
                <Pressable
                  style={styles.durationButton}
                  disabled={periods >= 99}
                  onPress={() => setPeriods((value) => Math.min(99, value + 1))}
                >
                  <Ionicons name="add" size={20} color={colors.ink} />
                </Pressable>
              </View>
              {paidPlan ? (
                <Text style={styles.paymentNote}>
                  Secure mobile checkout is not enabled. Choosing a paid plan here will not charge you or change your current subscription.
                </Text>
              ) : null}
              <Pressable
                style={[
                  styles.primaryButton,
                  (upgrading || paidPlan) && styles.buttonDisabled,
                ]}
                disabled={upgrading || paidPlan}
                onPress={confirmPlanSelection}
              >
                {upgrading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryButtonText}>
                    {paidPlan ? "Checkout unavailable in app" : "Activate free plan"}
                  </Text>
                )}
              </Pressable>
              {paidPlan ? (
                <Pressable style={styles.outlineButton} onPress={confirmPlanSelection}>
                  <Text style={styles.outlineButtonText}>Upgrade information</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={Boolean(detailPlan)}
        transparent
        animationType="slide"
        onRequestClose={() => setDetailPlan(null)}
      >
        {detailPlan ? (
          <View style={styles.modalBackdrop}>
            <View style={styles.modalSheet}>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitle}>{detailPlan.name}</Text>
                  <Text style={styles.planCode}>{detailPlan.code}</Text>
                </View>
                <Pressable onPress={() => setDetailPlan(null)} hitSlop={10}>
                  <Ionicons name="close" size={23} color={colors.ink} />
                </Pressable>
              </View>
              <ScrollView contentContainerStyle={styles.modalContent}>
                <Text style={styles.planPrice}>
                  {formatMoney(detailPlan.price, detailPlan.currency)}{" "}
                  <Text style={styles.priceCycle}>/ {detailPlan.billingCycle}</Text>
                </Text>
                <Text style={styles.planDescription}>
                  {detailPlan.description || "No description provided."}
                </Text>
                <Text style={styles.subheading}>Plan limits</Text>
                {Object.entries(usageLabels).map(([key, label]) => {
                  const limit = detailPlan.limits?.[key];
                  return (
                    <DataRow
                      key={key}
                      label={label}
                      value={
                        limit === null || limit === undefined
                          ? "Unlimited"
                          : Number(limit).toLocaleString("en-IN")
                      }
                    />
                  );
                })}
                {detailPlan.trialDays ? (
                  <DataRow label="Free trial" value={`${detailPlan.trialDays} days`} />
                ) : null}
                <Text style={styles.subheading}>Features</Text>
                {detailPlan.features?.length ? (
                  detailPlan.features.map((feature, index) => (
                    <View key={`${detailPlan._id}-${index}`} style={styles.featureRow}>
                      <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                      <Text style={styles.featureText}>{feature}</Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.muted}>No features listed.</Text>
                )}
              </ScrollView>
              <Pressable
                style={styles.primaryButton}
                onPress={() => {
                  setDetailPlan(null);
                  choosePlan(detailPlan);
                }}
              >
                <Text style={styles.primaryButtonText}>Choose this plan</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </Modal>

      <Modal
        visible={Boolean(invoiceDetail)}
        transparent
        animationType="slide"
        onRequestClose={() => setInvoiceDetail(null)}
      >
        {invoiceDetail ? (
          <View style={styles.modalBackdrop}>
            <View style={styles.modalSheet}>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitle}>
                    {invoiceDetail.invoiceNumber || "Invoice"}
                  </Text>
                  <Text style={styles.sectionSubtitle}>
                    {formatDate(invoiceDetail.createdAt)}
                  </Text>
                </View>
                <Pressable onPress={() => setInvoiceDetail(null)} hitSlop={10}>
                  <Ionicons name="close" size={23} color={colors.ink} />
                </Pressable>
              </View>
              <View style={styles.modalContent}>
                <DataRow label="Plan" value={invoiceDetail.planName || invoiceDetail.planCode || "—"} />
                <DataRow label="Status" value={invoiceDetail.status || "—"} />
                <DataRow label="Period start" value={formatDate(invoiceDetail.periodStart)} />
                <DataRow label="Period end" value={formatDate(invoiceDetail.periodEnd)} />
                <DataRow label="Due date" value={formatDate(invoiceDetail.dueDate)} />
                <DataRow label="Paid on" value={formatDate(invoiceDetail.paidAt)} />
                <DataRow label="Subtotal" value={formatMoney(invoiceDetail.amount, invoiceDetail.currency)} />
                <DataRow label="Tax" value={formatMoney(invoiceDetail.taxAmount, invoiceDetail.currency)} />
                <DataRow label="Total" value={formatMoney(invoiceDetail.totalAmount ?? invoiceDetail.amount, invoiceDetail.currency)} />
                <Pressable
                  style={styles.primaryButton}
                  onPress={() => void downloadInvoice(invoiceDetail)}
                >
                  <Text style={styles.primaryButtonText}>Download / share PDF</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ) : null}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 14, paddingBottom: 28, gap: 12 },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: colors.paper,
  },
  heading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 2,
  },
  headingIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: colors.amber,
    alignItems: "center",
    justifyContent: "center",
  },
  headingCopy: { flex: 1 },
  eyebrow: { color: colors.muted, fontSize: 9, fontWeight: "800", letterSpacing: 0.8 },
  title: { color: colors.ink, fontSize: 20, fontWeight: "800", marginTop: 2 },
  subtitle: { color: colors.muted, fontSize: 11, marginTop: 2 },
  sectionCard: { padding: 14, gap: 12 },
  sectionHeading: { flexDirection: "row", alignItems: "center", gap: 10 },
  sectionTitle: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  sectionSubtitle: { color: colors.muted, fontSize: 11, marginTop: 3 },
  currentPlan: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  currentPlanCopy: { flex: 1 },
  planName: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  planCode: { color: colors.muted, fontSize: 10, marginTop: 3 },
  currentPrice: { color: colors.ink, fontSize: 17, fontWeight: "800" },
  priceCycle: { color: colors.muted, fontSize: 10, fontWeight: "500" },
  statusBadge: {
    overflow: "hidden",
    borderRadius: 14,
    paddingHorizontal: 8,
    paddingVertical: 5,
    fontSize: 10,
    fontWeight: "800",
    textTransform: "capitalize",
  },
  statusSuccess: { color: "#16804A", backgroundColor: "#E9F6EF" },
  statusInfo: { color: colors.info, backgroundColor: "#EAF2F9" },
  statusAlert: { color: colors.alert, backgroundColor: "#FCEDEA" },
  statusNeutral: { color: colors.muted, backgroundColor: "#EEF0F3" },
  dataGrid: { gap: 7 },
  dataRow: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 9,
    backgroundColor: "#F6F7F9",
  },
  dataLabel: { color: colors.muted, fontSize: 11 },
  dataValue: {
    flex: 1,
    color: colors.ink,
    fontSize: 11,
    fontWeight: "700",
    textAlign: "right",
  },
  trialBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "#EAF2F9",
  },
  trialText: { color: colors.info, flex: 1, fontSize: 11, fontWeight: "700" },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 1 },
  subheading: { color: colors.ink, fontSize: 12, fontWeight: "800" },
  featureRow: { flexDirection: "row", alignItems: "flex-start", gap: 7 },
  featureText: { color: colors.text, flex: 1, fontSize: 11, lineHeight: 16 },
  muted: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  usageList: { gap: 12 },
  usageItem: { gap: 5 },
  usageCaption: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  usageLabel: { color: colors.text, fontSize: 11, fontWeight: "700" },
  usageValue: { color: colors.muted, fontSize: 10 },
  meterTrack: { height: 6, borderRadius: 4, backgroundColor: "#EAECF0", overflow: "hidden" },
  meterFill: { height: "100%", borderRadius: 4, backgroundColor: colors.success },
  meterOverLimit: { backgroundColor: colors.alert },
  alertText: { color: colors.alert },
  emptySubscription: { alignItems: "center", gap: 7, paddingVertical: 16 },
  emptyTitle: { color: colors.ink, fontSize: 14, fontWeight: "800" },
  scheduledCard: {
    padding: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: "#D5E3EF",
    backgroundColor: "#F7FAFC",
  },
  scheduledIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EAF2F9",
  },
  plansHeading: { paddingHorizontal: 2, paddingTop: 6 },
  planCard: { padding: 14, gap: 9 },
  planHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  planPriceRow: { flexDirection: "row", alignItems: "baseline", gap: 5, flexWrap: "wrap" },
  planPrice: { color: colors.ink, fontSize: 21, fontWeight: "800" },
  planDescription: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  trialTag: {
    overflow: "hidden",
    borderRadius: 12,
    paddingHorizontal: 7,
    paddingVertical: 3,
    color: colors.info,
    backgroundColor: "#EAF2F9",
    fontSize: 9,
    fontWeight: "700",
  },
  planActions: { flexDirection: "row", gap: 8, marginTop: 4 },
  primaryButton: {
    minHeight: 40,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: colors.ink,
  },
  primaryButtonText: { color: "#fff", fontSize: 11, fontWeight: "800", textAlign: "center" },
  outlineButton: {
    minHeight: 40,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: "#fff",
  },
  outlineButtonText: { color: colors.ink, fontSize: 11, fontWeight: "700", textAlign: "center" },
  buttonDisabled: { opacity: 0.55 },
  statusFilters: { gap: 7 },
  filterPill: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: "#fff",
  },
  filterPillActive: { borderColor: colors.ink, backgroundColor: colors.ink },
  filterText: { color: colors.text, fontSize: 10, fontWeight: "600", textTransform: "capitalize" },
  filterTextActive: { color: "#fff" },
  invoiceLoading: { paddingVertical: 18 },
  invoiceList: { gap: 9 },
  invoiceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF0F3",
  },
  invoiceInfo: { flex: 1, gap: 3 },
  invoiceNumber: { color: colors.ink, fontSize: 12, fontWeight: "800" },
  invoiceMeta: { color: colors.muted, fontSize: 10 },
  invoiceAmount: { color: colors.ink, fontSize: 11, fontWeight: "700" },
  invoiceActions: { alignItems: "flex-end", gap: 6 },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F3F7",
  },
  pagination: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 5,
  },
  pageControls: { flexDirection: "row", gap: 6 },
  pageButton: {
    width: 31,
    height: 31,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: "#F1F3F7",
  },
  errorCard: { padding: 13, borderColor: colors.alert, gap: 8 },
  errorText: { color: colors.alert, fontSize: 12, lineHeight: 17 },
  retryButton: { alignSelf: "flex-start", paddingVertical: 5, paddingHorizontal: 9 },
  retryText: { color: colors.ink, fontSize: 12, fontWeight: "800" },
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(15, 23, 42, 0.45)",
  },
  modalSheet: {
    maxHeight: "86%",
    paddingBottom: 16,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    backgroundColor: colors.paper,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 17,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: { color: colors.ink, fontSize: 17, fontWeight: "800" },
  modalContent: { padding: 16, gap: 12 },
  durationControl: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 18,
  },
  durationButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.border,
  },
  durationValue: { minWidth: 28, color: colors.ink, fontSize: 19, fontWeight: "800", textAlign: "center" },
  paymentNote: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
    padding: 10,
    borderRadius: 9,
    backgroundColor: "#EEF0F3",
  },
});
