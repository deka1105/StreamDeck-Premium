import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

export function RunningApps({
  data,
  onFocus,
  onPin,
  full,
  onRefresh,
  loading,
}: {
  data: { apps: string[]; frontmost: string | null } | null;
  onFocus: (name: string) => void;
  onPin: (name: string) => void;
  full: boolean;
  onRefresh: () => void;
  loading: boolean;
}) {
  const apps = data?.apps ?? [];
  const frontmost = data?.frontmost ?? null;
  const reported = !!data;

  return (
    <View style={styles.root}>
      <View style={styles.head}>
        <Text style={styles.title}>
          Running apps{reported && apps.length > 0 ? <Text style={styles.count}> · {apps.length}</Text> : null}
        </Text>
        <Pressable style={styles.refresh} onPress={onRefresh} hitSlop={8}>
          {loading ? <ActivityIndicator color="#cbd5e1" size="small" /> : <Text style={styles.refreshText}>↻ Refresh</Text>}
        </Pressable>
      </View>

      {!reported ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>🖥️</Text>
          <Text style={styles.emptyText}>Can’t reach the host yet…</Text>
        </View>
      ) : apps.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No apps reported.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {apps.map((name) => {
            const isFront = !!frontmost && name.toLowerCase() === frontmost.toLowerCase();
            return (
              <View key={name} style={styles.row}>
                <Pressable style={[styles.appBtn, isFront && styles.appBtnFront]} onPress={() => onFocus(name)}>
                  <Text style={styles.appIcon}>{isFront ? "🪄" : "🖥️"}</Text>
                  <Text style={[styles.appName, isFront && styles.appNameFront]} numberOfLines={1}>
                    {name}
                  </Text>
                  {isFront && <Text style={styles.frontTag}>frontmost</Text>}
                </Pressable>
                <Pressable style={[styles.pinBtn, full && styles.pinDisabled]} onPress={() => onPin(name)} disabled={full}>
                  <Text style={styles.pinText}>＋ Tile</Text>
                </Pressable>
              </View>
            );
          })}
        </ScrollView>
      )}

      <Text style={styles.hint}>Tap an app to focus it · ＋ Tile pins it to the active profile</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  title: { color: "#cbd5e1", fontSize: 15, fontWeight: "700" },
  count: { color: "#64748b", fontWeight: "600" },
  refresh: { backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, minWidth: 84, alignItems: "center" },
  refreshText: { color: "#cbd5e1", fontSize: 13, fontWeight: "600" },
  list: { gap: 8, paddingBottom: 16 },
  row: { flexDirection: "row", gap: 8, alignItems: "stretch" },
  appBtn: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#1e293b", borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, borderWidth: 1, borderColor: "transparent" },
  appBtnFront: { backgroundColor: "rgba(2,132,199,0.18)", borderColor: "rgba(56,189,248,0.5)" },
  appIcon: { fontSize: 18 },
  appName: { flex: 1, color: "#e2e8f0", fontSize: 15, fontWeight: "600" },
  appNameFront: { color: "#e0f2fe" },
  frontTag: { color: "#7dd3fc", fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  pinBtn: { backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 14, paddingHorizontal: 14, justifyContent: "center" },
  pinDisabled: { opacity: 0.4 },
  pinText: { color: "#e2e8f0", fontSize: 13, fontWeight: "700" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 40 },
  emptyIcon: { fontSize: 28 },
  emptyText: { color: "#64748b", fontSize: 14 },
  hint: { color: "#475569", fontSize: 11, textAlign: "center", marginTop: 8, marginBottom: 4 },
});
