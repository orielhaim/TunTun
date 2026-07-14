import DefaultTheme from "vitepress/theme";
import InstallPicker from "./components/InstallPicker.vue";
import MermaidCode from "./components/MermaidCode.vue";

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component("MermaidCode", MermaidCode);
    app.component("InstallPicker", InstallPicker);
  },
};
