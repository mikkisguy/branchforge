<script setup lang="ts">
import { withBase } from "vitepress";

const repoUrl = "https://github.com/mikkisguy/branchforge";
const installAnchor = withBase(
  "/user/getting-started#quick-start-with-docker-recommended"
);
const firstProject = withBase("/user/projects");
const changelog = withBase("/changelog");
const writing = withBase("/user/writing");
const scriptMode = withBase("/user/script-mode");
const flowGraph = withBase("/user/flow-graph");
const characters = withBase("/user/characters");
const importExport = withBase("/user/import-export");
</script>

<template>
  <div class="bf-home">
    <svg class="bf-icon-sprite" aria-hidden="true">
      <symbol id="bf-arrow" viewBox="0 0 24 24">
        <path d="M5 12h14m-6-6 6 6-6 6" />
      </symbol>
      <symbol id="bf-book" viewBox="0 0 24 24">
        <path
          d="M3 4h6a3 3 0 0 1 3 3v13a3 3 0 0 0-3-3H3Zm18 0h-6a3 3 0 0 0-3 3v13a3 3 0 0 1 3-3h6Z"
        />
      </symbol>
      <symbol id="bf-code" viewBox="0 0 24 24">
        <path d="m8 9-3 3 3 3m8-6 3 3-3 3m-2-9-4 18" />
      </symbol>
      <symbol id="bf-flow" viewBox="0 0 24 24">
        <rect x="9" y="2" width="6" height="6" rx="1" />
        <rect x="2" y="16" width="6" height="6" rx="1" />
        <rect x="16" y="16" width="6" height="6" rx="1" />
        <path d="M12 8v4m-7 4v-2h14v2" />
      </symbol>
      <symbol id="bf-box" viewBox="0 0 24 24">
        <path d="m3 7 9 5 9-5m-18 0 9-5 9 5v10l-9 5-9-5Z" />
        <path d="M12 12v10" />
      </symbol>
      <symbol id="bf-git" viewBox="0 0 24 24">
        <circle cx="6" cy="5" r="3" />
        <circle cx="18" cy="6" r="3" />
        <circle cx="6" cy="19" r="3" />
        <path d="M6 8v8m9-10h-1a8 8 0 0 0-8 8" />
      </symbol>
      <symbol id="bf-users" viewBox="0 0 24 24">
        <circle cx="9" cy="7" r="4" />
        <path
          d="M2 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2m0-17.87a4 4 0 0 1 0 7.75M22 21v-2a4 4 0 0 0-3-3.87"
        />
      </symbol>
      <symbol id="bf-terminal" viewBox="0 0 24 24">
        <path d="m4 17 6-6-6-6m8 14h8" />
      </symbol>
      <symbol id="bf-alert" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4m0 4h.01" />
      </symbol>
    </svg>

    <section class="bf-hero">
      <div>
        <p class="bf-eyebrow">Creative studio for Ren'Py visual novels</p>
        <h1>Write the story without losing sight of the script.</h1>
        <p class="bf-lead">
          Bring in your Ren'Py project, write dialogue in a focused workspace,
          edit the source when you need to, and trace branching paths without
          losing context.
        </p>
        <div class="bf-actions">
          <a class="bf-button bf-button-primary" :href="installAnchor"
            >Run BranchForge with Docker
            <svg aria-hidden="true"><use href="#bf-arrow" /></svg
          ></a>
          <a class="bf-button bf-button-secondary" :href="firstProject"
            >Read the user guide</a
          >
        </div>
        <p class="bf-quiet">
          Self-hosted · ZIP import and export · GitLab sync · Beta
        </p>
      </div>
      <div
        class="bf-proof"
        aria-label="How BranchForge connects a Ren'Py story"
      >
        <p class="bf-proof-label">One project, three ways to work</p>
        <div class="bf-proof-row">
          <span class="bf-proof-tag">WRITE</span>
          <p>
            <strong>Focus on the dialogue</strong><br />Write the prose while
            conditions, variables, stats, and visual cues stay close at hand.
          </p>
        </div>
        <div class="bf-proof-row">
          <span class="bf-proof-tag">SCRIPT</span>
          <p>
            <strong>Edit the Ren'Py source</strong><br />Switch to the actual
            <code>.rpy</code> when you need to work with conditions, menus,
            jumps, or variables.
          </p>
        </div>
        <div class="bf-proof-row">
          <span class="bf-proof-tag">FLOW</span>
          <p>
            <strong>See the branch structure</strong><br />Trace labels, routes,
            and connections across your story without changing the script.
          </p>
        </div>
      </div>
    </section>

    <section class="bf-release" aria-labelledby="release-title">
      <p class="bf-eyebrow">Recently added</p>
      <div>
        <h2 id="release-title">
          Manage Ren'Py files without leaving the workspace.
        </h2>
        <p>
          Create, rename, move, and delete project files directly from Write and
          Script modes.
        </p>
      </div>
      <a class="bf-text-link" :href="changelog"
        >Read the changelog
        <svg aria-hidden="true"><use href="#bf-arrow" /></svg
      ></a>
    </section>

    <section class="bf-section" aria-labelledby="views-title">
      <div class="bf-section-heading">
        <p class="bf-eyebrow">One workspace, three ways to work</p>
        <h2 id="views-title">Write, inspect, and export from one workspace.</h2>
        <p>
          BranchForge works with the Ren'Py project you already have and gives
          it back in a Ren'Py-ready format.
        </p>
      </div>
      <div class="bf-mode-grid">
        <a class="bf-mode-card" :href="writing"
          ><svg aria-hidden="true"><use href="#bf-book" /></svg
          ><span>Write mode</span>
          <h3>Stay focused on the prose</h3>
          <p>
            Draft dialogue and narration in a focused editor while
            source-derived context stays visible around your writing.
          </p></a
        >
        <a class="bf-mode-card" :href="scriptMode"
          ><svg aria-hidden="true"><use href="#bf-code" /></svg
          ><span>Script mode</span>
          <h3>Work directly in the <code>.rpy</code></h3>
          <p>
            Edit Ren'Py source with syntax highlighting and a file tree when the
            story logic needs attention.
          </p></a
        >
        <a class="bf-mode-card" :href="flowGraph"
          ><svg aria-hidden="true"><use href="#bf-flow" /></svg
          ><span>Flow graph</span>
          <h3>Trace where the story leads</h3>
          <p>
            Explore FLOW, ROUTE, and FILE layouts to understand labels and
            connections without editing the script.
          </p></a
        >
      </div>
      <p class="bf-workflow-label">How it fits into your workflow</p>
      <ol class="bf-workflow">
        <li>
          <svg aria-hidden="true"><use href="#bf-box" /></svg
          ><strong>Import</strong
          ><span>Open an existing project from a ZIP archive or GitLab.</span>
        </li>
        <li>
          <svg aria-hidden="true"><use href="#bf-book" /></svg
          ><strong>Write</strong
          ><span
            >Focus on dialogue or switch to the Ren'Py source when you need
            it.</span
          >
        </li>
        <li>
          <svg aria-hidden="true"><use href="#bf-flow" /></svg
          ><strong>Inspect</strong
          ><span>Trace labels, routes, jumps, and shared endings.</span>
        </li>
        <li>
          <svg aria-hidden="true"><use href="#bf-git" /></svg
          ><strong>Export</strong
          ><span
            >Download a ZIP archive or push your changes back to GitLab.</span
          >
        </li>
      </ol>
    </section>

    <section class="bf-section" aria-labelledby="tools-title">
      <div class="bf-section-heading">
        <p class="bf-eyebrow">More than a script editor</p>
        <h2 id="tools-title">Keep the rest of the story close, too.</h2>
      </div>
      <div class="bf-capability-grid">
        <a class="bf-capability" :href="characters"
          ><svg aria-hidden="true"><use href="#bf-users" /></svg>
          <h3>Characters and story state</h3>
          <p>
            Keep characters, variables, stats, world details, and pair groups
            alongside the project they belong to.
          </p>
          <span
            >Explore story tools
            <svg aria-hidden="true"><use href="#bf-arrow" /></svg></span
        ></a>
        <a class="bf-capability" :href="importExport"
          ><svg aria-hidden="true"><use href="#bf-git" /></svg>
          <h3>Import and sync</h3>
          <p>
            Bring in an existing project with ZIP or GitLab, then export a
            Ren'Py-compatible archive or push your changes back.
          </p>
          <span
            >Read import and export
            <svg aria-hidden="true"><use href="#bf-arrow" /></svg></span
        ></a>
      </div>
    </section>

    <section class="bf-docker" aria-labelledby="docker-title">
      <div>
        <svg class="bf-docker-icon" aria-hidden="true">
          <use href="#bf-terminal" />
        </svg>
        <h2 id="docker-title">Run BranchForge on your own machine.</h2>
        <p>
          Start PostgreSQL, the backend, and the frontend together with Docker.
          The installation guide covers configuration, environment variables,
          and ports.
        </p>
        <a class="bf-button bf-button-primary" :href="installAnchor"
          >Open installation guide
          <svg aria-hidden="true"><use href="#bf-arrow" /></svg
        ></a>
      </div>
      <pre><code>git clone https://github.com/mikkisguy/branchforge.git
cd branchforge
cp .env.example .env
docker compose up -d</code></pre>
    </section>

    <section
      class="bf-section bf-status-section"
      aria-labelledby="status-title"
    >
      <div class="bf-section-heading">
        <p class="bf-eyebrow">Project status</p>
        <h2 id="status-title">BranchForge is still in beta.</h2>
      </div>
      <div class="bf-status-grid">
        <article>
          <svg aria-hidden="true"><use href="#bf-alert" /></svg>
          <h3>What is not ready yet</h3>
          <p>
            GitLab conflict review is read-only, so conflicts still need to be
            resolved in GitLab or locally before pulling again. Beta reader
            management, snippets, and the definitions import wizard are also
            still planned.
          </p>
        </article>
        <article>
          <svg aria-hidden="true"><use href="#bf-git" /></svg>
          <h3>Open source by design</h3>
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
        </article>
      </div>
    </section>

    <section class="bf-cta">
      <p class="bf-eyebrow">Start with the project you already have</p>
      <h2>Bring in your Ren'Py project. Keep writing.</h2>
      <p>
        Learn how BranchForge reads your scripts, what it imports, and how to
        get your first project into the workspace.
      </p>
      <a class="bf-button bf-button-primary" :href="firstProject"
        >Import your first project
        <svg aria-hidden="true"><use href="#bf-arrow" /></svg
      ></a>
    </section>
    <footer class="bf-footer">
      <p>BranchForge documentation · GPL v3 · Beta software</p>
    </footer>
  </div>
</template>
