const fs = require("fs");
const tsPath = "src/app/components/market-cipher-b-chart/market-cipher-b-chart.component.ts";
let ts = fs.readFileSync(tsPath, "utf8").replace(/\r\n/g, "\n");
const needle = "    this.interaction.onTouchMove(event, this.chart?.chart as any);\n  }\n  onTouchEnd(event: TouchEvent): void {";
const insert = "    this.interaction.onTouchMove(event, this.chart?.chart as any);\n    if (this.interaction.isInteracting && this.interaction.gestureType === 'pan') {\n      this.scheduleMcbPanSync();\n    }\n  }\n  onTouchEnd(event: TouchEvent): void {";
if (!ts.includes("onTouchMove") || ts.includes("onTouchMove(event, this.chart?.chart as any);\n    if (this.interaction.isInteracting")) {
  // check if already patched for touch
  if (ts.includes("onTouchMove(event, this.chart?.chart as any);\n    if (this.interaction.isInteracting")) {
    console.log("touch already patched");
  } else {
    ts = ts.replace(needle, insert);
    fs.writeFileSync(tsPath, ts);
    console.log("touch pan sync added");
  }
}
