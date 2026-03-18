(() => {
  var __async = (__this, __arguments, generator) => {
    return new Promise((resolve, reject) => {
      var fulfilled = (value) => {
        try {
          step(generator.next(value));
        } catch (e) {
          reject(e);
        }
      };
      var rejected = (value) => {
        try {
          step(generator.throw(value));
        } catch (e) {
          reject(e);
        }
      };
      var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
      step((generator = generator.apply(__this, __arguments)).next());
    });
  };

  // src/config.ts
  var BACKEND_URL = "https://figma-design-system-plugin.onrender.com";
  var KEEPALIVE_INTERVAL = 10 * 60 * 1e3;

  // src/ui.ts
  function startKeepAlive() {
    const ping = () => {
      fetch(`${BACKEND_URL.replace("/api/generate", "")}/health`).catch(() => {
      });
    };
    ping();
    setInterval(ping, KEEPALIVE_INTERVAL);
  }
  function generate(brand) {
    return __async(this, null, function* () {
      var _a;
      setStatus("loading", "Analyzing brand with reasoning engine...");
      try {
        const res = yield fetch(`${BACKEND_URL}/api/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(brand)
        });
        if (!res.ok) {
          const err = yield res.json();
          throw new Error((_a = err.error) != null ? _a : "Backend error");
        }
        const { operations, spec } = yield res.json();
        setStatus("loading", `Building design system \u2014 ${operations.length} operations...`);
        showSpec(spec);
        parent.postMessage(
          { pluginMessage: { type: "EXECUTE", operations } },
          "*"
        );
      } catch (err) {
        setStatus("error", err.message);
      }
    });
  }
  function setStatus(type, message) {
    const el = document.getElementById("status");
    if (!el) return;
    el.textContent = message;
    el.className = `status status--${type}`;
  }
  function showSpec(spec) {
    var _a, _b, _c, _d, _e, _f;
    const el = document.getElementById("spec-preview");
    if (!el) return;
    el.innerHTML = `
    <div class="spec-row"><span>Style</span><strong>${(_a = spec.style) != null ? _a : "\u2014"}</strong></div>
    <div class="spec-row"><span>Heading font</span><strong>${(_c = (_b = spec.typography) == null ? void 0 : _b.heading) != null ? _c : "\u2014"}</strong></div>
    <div class="spec-row"><span>Body font</span><strong>${(_e = (_d = spec.typography) == null ? void 0 : _d.body) != null ? _e : "\u2014"}</strong></div>
    <div class="spec-row colors">
      ${Object.entries((_f = spec.colors) != null ? _f : {}).map(
      ([k, v]) => `<span class="swatch" style="background:${v}" title="${k}: ${v}"></span>`
    ).join("")}
    </div>
  `;
  }
  window.onload = () => {
    var _a;
    startKeepAlive();
    (_a = document.getElementById("generate-btn")) == null ? void 0 : _a.addEventListener("click", () => {
      var _a2, _b, _c, _d, _e;
      const name = (_a2 = document.getElementById("brand-name")) == null ? void 0 : _a2.value.trim();
      const industry = (_b = document.getElementById("industry")) == null ? void 0 : _b.value.trim();
      const productType = (_c = document.getElementById("product-type")) == null ? void 0 : _c.value.trim();
      const primaryColor = ((_d = document.getElementById("primary-color")) == null ? void 0 : _d.value) || void 0;
      const tone = (_e = document.getElementById("tone")) == null ? void 0 : _e.value;
      if (!name || !industry || !productType) {
        setStatus("error", "Fill in all required fields");
        return;
      }
      generate({ name, industry, productType, primaryColor, tone });
    });
    window.addEventListener("message", (event) => {
      var _a2;
      const msg = (_a2 = event.data) == null ? void 0 : _a2.pluginMessage;
      if ((msg == null ? void 0 : msg.type) === "DONE") {
        setStatus("success", `Done \u2014 ${msg.count} nodes created`);
      }
      if ((msg == null ? void 0 : msg.type) === "ERROR") {
        setStatus("error", msg.message);
      }
    });
  };
})();
