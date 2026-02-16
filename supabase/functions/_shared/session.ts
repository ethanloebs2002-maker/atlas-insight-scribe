export function utcSessionLabel(d: Date) {
  const h = d.getUTCHours();
  const inAsia = h >= 0 && h < 8;
  const inEurope = h >= 7 && h < 15;
  const inUS = h >= 13 && h < 21;
  const overlaps = [inAsia, inEurope, inUS].filter(Boolean).length;

  if (overlaps >= 2) {
    if (inAsia && inEurope) return { primary: "Overlap", detail: "Asia→Europe", hour: h };
    if (inEurope && inUS) return { primary: "Overlap", detail: "Europe→US", hour: h };
    return { primary: "Overlap", detail: "Multi-Overlap", hour: h };
  }
  if (inAsia) return { primary: "Asia", detail: "Asia", hour: h };
  if (inEurope) return { primary: "Europe", detail: "Europe", hour: h };
  if (inUS) return { primary: "US", detail: "US", hour: h };
  return { primary: "OffHours", detail: "OffHours", hour: h };
}
