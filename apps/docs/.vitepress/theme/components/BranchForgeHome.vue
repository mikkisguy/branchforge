<script setup lang="ts">
import { computed } from "vue";
import { useData, withBase } from "vitepress";

const repoUrl = "https://github.com/mikkisguy/branchforge";
const demoProjectUrl = "https://github.com/remarkablegames/renpy-examples";
const installAnchor = withBase(
  "/user/getting-started#quick-start-with-docker-recommended"
);
const firstProject = withBase("/user/projects");
const writing = withBase("/user/writing");
const scriptMode = withBase("/user/script-mode");
const flowGraph = withBase("/user/flow-graph");
const characters = withBase("/user/characters");
const { isDark } = useData();
const darkScreenshot = withBase("/images/branchforge-write-mode.png");
const lightScreenshot = withBase("/images/branchforge-write-mode-light.png");
const screenshot = computed(() =>
  isDark.value ? darkScreenshot : lightScreenshot
);
const screenshotHeight = computed(() => (isDark.value ? 1085 : 1088));
</script>

<template>
  <div class="bf-home">
    <svg class="bf-icon-sprite" aria-hidden="true">
      <symbol id="bf-arrow" viewBox="0 0 24 24">
        <path d="M5 12h14m-6-6 6 6-6 6" />
      </symbol>
    </svg>

    <section class="bf-hero">
      <div>
        <h1>Write the story without losing sight of the script.</h1>
        <p class="bf-lead">
          Creative studio for Ren'Py visual novels. Bring in your Ren'Py
          project, write dialogue in a focused workspace, edit the source when
          you need to, and trace branching paths without losing context.
        </p>
        <div class="bf-actions">
          <a class="bf-button bf-button-primary" :href="installAnchor"
            >Run BranchForge with Docker
            <svg aria-hidden="true"><use href="#bf-arrow" /></svg
          ></a>
          <a class="bf-secondary-action" :href="firstProject"
            >Read the user guide</a
          >
        </div>
        <p class="bf-quiet">Self-hosted · Open source · Beta</p>
      </div>
    </section>

    <figure class="bf-screenshot" aria-labelledby="screenshot-caption">
      <a
        :href="screenshot"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Open full-resolution screenshot"
      >
        <img
          :src="screenshot"
          alt="BranchForge Write mode showing a Ren'Py project loaded in the editor"
          width="1917"
          :height="screenshotHeight"
        />
      </a>
      <figcaption id="screenshot-caption">
        Demo project
        <a :href="demoProjectUrl" target="_blank" rel="noopener noreferrer"
          >Ren'Py Examples by remarkablegames</a
        >, MIT.
      </figcaption>
    </figure>

    <section class="bf-section" aria-labelledby="lifecycle-title">
      <h2 id="lifecycle-title">Your project stays a Ren'Py project.</h2>
      <ol class="bf-lifecycle">
        <li>Import existing project</li>
        <li>Write or edit</li>
        <li>Inspect branches</li>
        <li>Export ZIP or sync GitLab</li>
      </ol>
    </section>

    <section class="bf-section" aria-labelledby="modes-title">
      <h2 id="modes-title">Write prose. Edit the script. See the structure.</h2>
      <div class="bf-modes">
        <div class="bf-mode-column">
          <h3>Write</h3>
          <p>
            Focus on dialogue and narration while source-derived context stays
            close at hand.
          </p>
          <a class="bf-text-link" :href="writing"
            >Write mode docs
            <svg aria-hidden="true"><use href="#bf-arrow" /></svg
          ></a>
        </div>
        <div class="bf-mode-column">
          <h3>Script</h3>
          <p>
            Switch to the actual <code>.rpy</code> when menus, jumps,
            conditions, or variables need attention.
          </p>
          <a class="bf-text-link" :href="scriptMode"
            >Script mode docs
            <svg aria-hidden="true"><use href="#bf-arrow" /></svg
          ></a>
        </div>
        <div class="bf-mode-column">
          <h3>Flow</h3>
          <p>
            Trace labels, routes, jumps, and shared endings without changing the
            script.
          </p>
          <a class="bf-text-link" :href="flowGraph"
            >Flow graph docs
            <svg aria-hidden="true"><use href="#bf-arrow" /></svg
          ></a>
        </div>
      </div>
      <p class="bf-supporting">
        Characters, variables, stats, and world details stay close by too.
        <a :href="characters">Explore story tools</a>.
      </p>
    </section>

    <section class="bf-section" aria-labelledby="status-title">
      <h2 id="status-title">Self-hosted, open source, and in beta.</h2>
      <div class="bf-status">
        <div class="bf-status-column">
          <h3>Self-hosted</h3>
          <p>
            Run BranchForge on your own machine with Docker. You control the
            data, the domain, and the environment.
          </p>
        </div>
        <div class="bf-status-column">
          <h3>Open source</h3>
          <p>
            BranchForge is licensed under GPL v3. Contributions, bug reports,
            ideas, and feedback are welcome on GitHub.
          </p>
          <a
            class="bf-text-link"
            :href="repoUrl"
            target="_blank"
            rel="noreferrer"
            >View repository
            <svg aria-hidden="true"><use href="#bf-arrow" /></svg
          ></a>
        </div>
        <div class="bf-status-column">
          <h3>Beta</h3>
          <p>
            GitLab conflict review is read-only, so conflicts still need to be
            resolved in GitLab or locally before pulling again. Beta reader
            management, snippets, and the definitions import wizard are still
            planned.
          </p>
        </div>
      </div>
    </section>

    <section class="bf-docker" aria-labelledby="install-title">
      <div>
        <h2 id="install-title">Install BranchForge with Docker.</h2>
        <p>
          Start PostgreSQL, the backend, and the frontend together. The
          installation guide covers configuration, environment variables, and
          ports.
        </p>
        <div class="bf-actions">
          <a class="bf-button bf-button-primary" :href="installAnchor"
            >Open installation guide
            <svg aria-hidden="true"><use href="#bf-arrow" /></svg
          ></a>
          <a
            class="bf-secondary-action"
            :href="repoUrl"
            target="_blank"
            rel="noreferrer"
            >GitHub</a
          >
        </div>
      </div>
      <pre><code>git clone https://github.com/mikkisguy/branchforge.git
cd branchforge
cp .env.example .env
docker compose up -d</code></pre>
    </section>

    <footer class="bf-footer">
      <p>BranchForge documentation · GPL v3 · Beta software</p>
    </footer>
  </div>
</template>
