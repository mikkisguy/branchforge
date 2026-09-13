<script setup lang="ts">
import { useRoute } from "vitepress";
import DefaultTheme from "vitepress/theme";
import BranchForgeHome from "./components/BranchForgeHome.vue";

const route = useRoute();
const isHome = route.path === "/" || route.path === "/index.html";
</script>

<template>
  <BranchForgeHome v-if="isHome" />
  <component :is="DefaultTheme.Layout" v-else />
</template>
