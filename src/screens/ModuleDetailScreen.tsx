import React, { useEffect } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { detailFields } from "../lib/format";
import { Button, Card } from "../components/UI";
import { send } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { RECORD_ACTIONS } from "../lib/forms";
import { colors } from "../theme";
import type { RootStackParams } from "../../App";

export default function ModuleDetailScreen({ route, navigation }: NativeStackScreenProps<RootStackParams, "Detail">) {
  const { title, row, endpoint } = route.params;
  const { can } = useAuth();
  const acts = endpoint ? RECORD_ACTIONS[endpoint] : undefined;
  const confirmDelete = () => Alert.alert("Delete", "This cannot be undone. Continue?", [
    { text: "Cancel", style: "cancel" },
    { text: "Delete", style: "destructive", onPress: async () => {
      try { await send(`${endpoint}/${row._id}`, "DELETE"); navigation.goBack(); }
      catch (e) { Alert.alert("Error", (e as Error).message); }
    } },
  ]);
  const due = row.balance ?? row.due ?? row.dueAmount ?? row.amount;
  const setStatus = async (status: string) => {
    try { await send(`/leaves/${row._id}/status`, "PATCH", { status }); Alert.alert("Done", `Leave ${status}`, [{ text: "OK", onPress: () => navigation.goBack() }]); }
    catch (e) { Alert.alert("Error", (e as Error).message); }
  };
  useEffect(() => { navigation.setOptions({ title }); }, [navigation, title]);
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.paper }} contentContainerStyle={{ padding: 16 }}>
      <Card>
        {detailFields(row).map(([k, v]) => (
          <View key={k} style={s.row}><Text style={s.k}>{k}</Text><Text style={s.v}>{v}</Text></View>
        ))}
      </Card>
      <View style={{ gap: 10, marginTop: 16 }}>
        {endpoint === "/fees" && can("fees:collect") && (
          <Button title="Collect payment" onPress={() => navigation.navigate("Form", { form: "payment", initial: { invoiceId: String(row._id), amount: due != null ? String(due) : "" } })} />
        )}
        {acts?.edit && can(acts.edit) && <Button title="Edit" variant="ghost" onPress={() => navigation.navigate("Edit", { endpoint: endpoint!, row })} />}
        {acts?.del && can(acts.del) && <Button title="Delete" variant="ghost" onPress={confirmDelete} />}
      </View>
      {endpoint === "/leaves" && can("leaves:approve") && row.status === "Pending" && (
        <View style={{ gap: 10, marginTop: 16 }}><Button title="Approve" onPress={() => setStatus("Approved")} /><Button title="Reject" variant="ghost" onPress={() => setStatus("Rejected")} /></View>
      )}
    </ScrollView>
  );
}
const s = StyleSheet.create({
  row: { paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  k: { color: colors.muted, fontSize: 12 }, v: { color: colors.ink, fontWeight: "600", marginTop: 2 },
});
