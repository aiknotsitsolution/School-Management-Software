import React from "react";
import { View, Text } from "react-native";
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from "react-native-svg";
import { colors } from "../theme";

export interface Point { label: string; value: number }
const W = 320, H = 170, PAD = { l: 30, r: 10, t: 12, b: 26 };

// Area/line chart, y-axis fixed 0–100 (percentages).
export function TrendChart({ data, color = colors.success }: { data: Point[]; color?: string }) {
  if (data.length < 2) return <Text style={{ color: colors.muted, textAlign: "center", padding: 24 }}>Not enough data yet</Text>;
  const iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;
  const x = (i: number) => PAD.l + (i / (data.length - 1)) * iw;
  const y = (v: number) => PAD.t + ih - (Math.max(0, Math.min(100, v)) / 100) * ih;
  const line = data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(" ");
  const area = `${line} L${x(data.length - 1)},${PAD.t + ih} L${x(0)},${PAD.t + ih} Z`;
  const step = Math.ceil(data.length / 5);
  return (
    <Svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H}>
      <Defs><LinearGradient id="g" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={color} stopOpacity="0.35" /><Stop offset="1" stopColor={color} stopOpacity="0" /></LinearGradient></Defs>
      {[0, 50, 100].map((t) => (
        <G key={t}><Line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke={colors.border} strokeWidth={1} />
          <SvgText x={PAD.l - 6} y={y(t) + 3} fontSize="9" fill={colors.muted} textAnchor="end">{t}%</SvgText></G>
      ))}
      <Path d={area} fill="url(#g)" />
      <Path d={line} stroke={color} strokeWidth={2.5} fill="none" strokeLinejoin="round" />
      {data.map((d, i) => <Circle key={i} cx={x(i)} cy={y(d.value)} r={3} fill={color} />)}
      {data.map((d, i) => (i % step === 0 || i === data.length - 1) && <SvgText key={`l${i}`} x={x(i)} y={H - 8} fontSize="9" fill={colors.muted} textAnchor="middle">{d.label}</SvgText>)}
    </Svg>
  );
}

export function BarChart({ data, color = colors.ink }: { data: Point[]; color?: string }) {
  if (!data.length) return <Text style={{ color: colors.muted, textAlign: "center", padding: 24 }}>No data</Text>;
  const max = Math.max(...data.map((d) => d.value), 1);
  const iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b, bw = iw / data.length;
  return (
    <Svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H}>
      <Line x1={PAD.l} x2={W - PAD.r} y1={PAD.t + ih} y2={PAD.t + ih} stroke={colors.border} />
      {data.map((d, i) => {
        const h = (d.value / max) * ih;
        return (
          <G key={i}>
            <Rect x={PAD.l + i * bw + bw * 0.2} y={PAD.t + ih - h} width={bw * 0.6} height={h} rx={4} fill={color} />
            <SvgText x={PAD.l + i * bw + bw / 2} y={PAD.t + ih - h - 4} fontSize="9" fill={colors.ink} textAnchor="middle">{d.value}</SvgText>
            <SvgText x={PAD.l + i * bw + bw / 2} y={H - 8} fontSize="9" fill={colors.muted} textAnchor="middle">{d.label}</SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

export const ChartLegend = ({ items }: { items: [string, string][] }) => (
  <View style={{ flexDirection: "row", gap: 14, flexWrap: "wrap" }}>
    {items.map(([c, t]) => <View key={t} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}><View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c }} /><Text style={{ color: colors.muted, fontSize: 12 }}>{t}</Text></View>)}
  </View>
);
