<template>
  <div class="mermaid-container">
    <div v-if="loading" class="mermaid-loading">Loading diagram...</div>
    <div ref="diagramRef" class="mermaid-raw" v-html="svgContent"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";

const props = defineProps<{
  code: string;
}>();

const loading = ref(true);
const svgContent = ref("");

onMounted(async () => {
  try {
    const { default: mermaid } = await import("mermaid");

    const isDark = document.documentElement.classList.contains("dark");

    mermaid.initialize({
      startOnLoad: false,
      theme: isDark ? "dark" : "default",
      securityLevel: "loose",
      useMaxWidth: false,
    });

    const decodedCode = decodeURIComponent(props.code);
    const elementId = `mermaid-${Math.random().toString(36).slice(2, 9)}`;

    const { svg } = await mermaid.render(elementId, decodedCode);
    svgContent.value = svg;
  } catch (err) {
    console.error("Mermaid render error:", err);
    svgContent.value = `<pre class="mermaid-error">Error rendering diagram</pre>`;
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.mermaid-container {
  margin: 1.5rem 0;
  padding: 1.5rem;
  background-color: var(--vp-c-bg-soft);
  border-radius: 8px;
  border: 1px solid var(--vp-c-gutter);

  display: block;

  direction: ltr;

  overflow-x: auto;
  scrollbar-width: thin;
}

@media (min-width: 850px) {
  .mermaid-container {
    margin-left: -24px;
    margin-right: -24px;
  }
}

.mermaid-loading {
  color: var(--vp-c-text-2);
  font-size: 0.9rem;
  text-align: center;
}

.mermaid-raw {
  display: block;
  width: 100%;
}

.mermaid-raw :deep(svg) {
  max-width: none !important;
  height: auto !important;

  margin: 0 auto;
  display: block;
}

.mermaid-error {
  color: var(--vp-c-danger-1);
  font-family: monospace;
  padding: 0.5rem;
}
</style>