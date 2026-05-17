const BASE_URL = "http://localhost:3000";
const pkgs = ["is-number", "lodash", "node-ipc", "colors"];

async function run() {
  for (let i = 0; i < pkgs.length; i++) {
    const pkg = pkgs[i];
    console.log(`\n--- Testing ${pkg} ---`);
    const wallet = "0x" + Math.random().toString(16).slice(2, 10).padEnd(40, "0");
    const start = Date.now();
    try {
      const res = await fetch(`${BASE_URL}/api/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageName: pkg, walletAddress: wallet })
      });
      const text = await res.text();
      let json;
      try {
        json = JSON.parse(text);
        const result = {
          validJSON: true,
          error: json.error || null,
          severity: json.data?.report?.riskLevel,
          score: json.data?.report?.riskScore,
          heuristCalled: json.data?.report?.heuristCalled,
          timeMs: Date.now() - start
        };
        console.log(JSON.stringify(result, null, 2));
      } catch {
        console.log("FAILED PARSE:", text.slice(0, 200));
      }
    } catch (err) {
      console.log("FETCH ERR:", err.message);
    }
  }
}

run();
