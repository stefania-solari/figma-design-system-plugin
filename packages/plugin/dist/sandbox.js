(() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };
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

  // src/sandbox.ts
  var require_sandbox = __commonJS({
    "src/sandbox.ts"(exports) {
      function hexToRgb(hex) {
        const r = parseInt(hex.slice(1, 3), 16) / 255;
        const g = parseInt(hex.slice(3, 5), 16) / 255;
        const b = parseInt(hex.slice(5, 7), 16) / 255;
        return { r, g, b };
      }
      function getOrCreateCollection(name) {
        var _a;
        return (_a = figma.variables.getLocalVariableCollections().find((c) => c.name === name)) != null ? _a : figma.variables.createVariableCollection(name);
      }
      function execCreatePage(op) {
        return __async(this, null, function* () {
          const page = figma.createPage();
          page.name = op.name;
          figma.root.insertChild(op.index, page);
        });
      }
      function execCreateColorStyle(op) {
        return __async(this, null, function* () {
          var _a;
          const style = figma.createPaintStyle();
          style.name = op.name;
          style.paints = [{
            type: "SOLID",
            color: hexToRgb(op.hex),
            opacity: (_a = op.opacity) != null ? _a : 1
          }];
        });
      }
      function execCreateTextStyle(op) {
        return __async(this, null, function* () {
          yield figma.loadFontAsync({ family: op.fontFamily, style: "Regular" }).catch(
            () => figma.loadFontAsync({ family: "Inter", style: "Regular" })
          );
          const style = figma.createTextStyle();
          style.name = op.name;
          style.fontName = { family: op.fontFamily, style: "Regular" };
          style.fontSize = op.fontSize;
          style.lineHeight = { value: op.lineHeight, unit: "PERCENT" };
          if (op.letterSpacing !== void 0) {
            style.letterSpacing = { value: op.letterSpacing, unit: "PERCENT" };
          }
        });
      }
      function execCreateVariable(op) {
        return __async(this, null, function* () {
          const collection = getOrCreateCollection(op.collection);
          const variable = figma.variables.createVariable(op.name, collection, op.type);
          variable.setValueForMode(collection.defaultModeId, op.value);
        });
      }
      function execCreateComponent(op) {
        return __async(this, null, function* () {
          var _a;
          const page = figma.currentPage;
          const component = figma.createComponent();
          component.name = op.name;
          component.resize(200, 48);
          component.layoutMode = "HORIZONTAL";
          component.paddingLeft = 16;
          component.paddingRight = 16;
          component.paddingTop = 8;
          component.paddingBottom = 8;
          component.itemSpacing = 8;
          component.primaryAxisAlignItems = "CENTER";
          component.counterAxisAlignItems = "CENTER";
          yield figma.loadFontAsync({ family: "Inter", style: "Regular" });
          const label = figma.createText();
          label.characters = (_a = op.name.split("/").pop()) != null ? _a : op.name;
          label.fontSize = 14;
          component.appendChild(label);
          page.appendChild(component);
        });
      }
      function execCreateCoverPage(op) {
        return __async(this, null, function* () {
          const page = figma.createPage();
          page.name = "Cover";
          figma.root.insertChild(0, page);
          const frame = figma.createFrame();
          frame.name = "Cover";
          frame.resize(1440, 900);
          frame.fills = [{ type: "SOLID", color: { r: 0.97, g: 0.97, b: 0.97 } }];
          yield figma.loadFontAsync({ family: "Inter", style: "Bold" });
          yield figma.loadFontAsync({ family: "Inter", style: "Regular" });
          const title = figma.createText();
          title.characters = op.systemName;
          title.fontSize = 64;
          title.fontName = { family: "Inter", style: "Bold" };
          title.x = 80;
          title.y = 80;
          frame.appendChild(title);
          const version = figma.createText();
          version.characters = `v${op.version}`;
          version.fontSize = 16;
          version.fontName = { family: "Inter", style: "Regular" };
          version.fills = [{ type: "SOLID", color: { r: 0.5, g: 0.5, b: 0.5 } }];
          version.x = 80;
          version.y = 160;
          frame.appendChild(version);
          op.palette.forEach((hex, i) => {
            const swatch = figma.createRectangle();
            swatch.resize(80, 80);
            swatch.x = 80 + i * 96;
            swatch.y = 220;
            swatch.cornerRadius = 8;
            swatch.fills = [{ type: "SOLID", color: hexToRgb(hex) }];
            frame.appendChild(swatch);
          });
          page.appendChild(frame);
        });
      }
      function executeAll(operations) {
        return __async(this, null, function* () {
          let count = 0;
          for (const op of operations) {
            try {
              switch (op.op) {
                case "createPage":
                  yield execCreatePage(op);
                  break;
                case "createColorStyle":
                  yield execCreateColorStyle(op);
                  break;
                case "createTextStyle":
                  yield execCreateTextStyle(op);
                  break;
                case "createVariable":
                  yield execCreateVariable(op);
                  break;
                case "createComponent":
                  yield execCreateComponent(op);
                  break;
                case "createCoverPage":
                  yield execCreateCoverPage(op);
                  break;
              }
              count++;
            } catch (err) {
              console.error(`[sandbox] Failed op ${op.op}:`, err.message);
            }
          }
          return count;
        });
      }
      figma.ui.onmessage = (msg) => __async(exports, null, function* () {
        if (msg.type !== "EXECUTE") return;
        try {
          const count = yield executeAll(msg.operations);
          figma.ui.postMessage({ type: "DONE", count });
          figma.notify(`Design system created \u2014 ${count} elements`);
        } catch (err) {
          figma.ui.postMessage({ type: "ERROR", message: err.message });
          figma.notify("Error: " + err.message, { error: true });
        }
      });
      figma.showUI(__html__, { width: 380, height: 520 });
    }
  });
  require_sandbox();
})();
