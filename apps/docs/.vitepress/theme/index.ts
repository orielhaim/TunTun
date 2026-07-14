import DefaultTheme from "vitepress/theme";
import MermaidCode from "./components/MermaidCode.vue";

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component("MermaidCode", MermaidCode);
  },
};
