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
        <p class="bf-eyebrow">A workspace for existing Ren'Py projects</p>
        <h1>Keep the story readable. Keep the source in reach.</h1>
        <p class="bf-lead">
          BranchForge imports your <code>.rpy</code> files, lets you write
          dialogue without losing technical context, and maps every branch back
          to the script.
        </p>
        <div class="bf-actions">
          <a class="bf-button bf-button-primary" :href="installAnchor"
            >Run with Docker
            <svg aria-hidden="true"><use href="#bf-arrow" /></svg
          ></a>
          <a class="bf-button bf-button-secondary" :href="firstProject"
            >Read the user guide</a
          >
        </div>
        <p class="bf-quiet">
          Self-hosted · ZIP import and export · GitLab sync
        </p>
      </div>
      <div
        class="bf-proof"
        aria-label="How BranchForge connects a Ren'Py story"
      >
        <p class="bf-proof-label">One project, three useful views</p>
        <div class="bf-proof-row">
          <span class="bf-proof-tag">WRITE</span>
          <p>
            <strong>Dialogue</strong><br />Technical context stays beside the
            prose.
          </p>
        </div>
        <div class="bf-proof-row">
          <span class="bf-proof-tag">SCRIPT</span>
          <p>
            <strong>Ren'Py source</strong><br />Conditions, menus, jumps, and
            variables remain editable.
          </p>
        </div>
        <div class="bf-proof-row">
          <span class="bf-proof-tag">FLOW</span>
          <p>
            <strong>Branch structure</strong><br />Follow labels, routes, and
            shared endings without changing code.
          </p>
        </div>
      </div>
    </section>

    <section class="bf-release" aria-labelledby="release-title">
      <p class="bf-eyebrow">Latest release</p>
      <div>
        <h2 id="release-title">
          File management is now available in Write and Script.
        </h2>
        <p>Create, rename, move, and delete Ren'Py files from the workspace.</p>
      </div>
      <a class="bf-text-link" :href="changelog"
        >Read the changelog
        <svg aria-hidden="true"><use href="#bf-arrow" /></svg
      ></a>
    </section>

    <section class="bf-section" aria-labelledby="views-title">
      <div class="bf-section-heading">
        <p class="bf-eyebrow">Work from the right level of detail</p>
        <h2 id="views-title">
          Choose the view that answers your next question.
        </h2>
      </div>
      <div class="bf-mode-grid">
        <a class="bf-mode-card" :href="writing"
          ><svg aria-hidden="true"><use href="#bf-book" /></svg
          ><span>Write mode</span>
          <h3>Draft dialogue and narration</h3>
          <p>
            Write in a focused editor with source-derived badges for the details
            that matter.
          </p></a
        >
        <a class="bf-mode-card" :href="scriptMode"
          ><svg aria-hidden="true"><use href="#bf-code" /></svg
          ><span>Script mode</span>
          <h3>Edit the actual <code>.rpy</code></h3>
          <p>
            Use syntax highlighting and a file tree when you need conditions,
            menus, and jumps.
          </p></a
        >
        <a class="bf-mode-card" :href="flowGraph"
          ><svg aria-hidden="true"><use href="#bf-flow" /></svg
          ><span>Flow graph</span>
          <h3>Check where a choice leads</h3>
          <p>
            Explore FLOW, ROUTE, and FILE layouts without changing your script.
          </p></a
        >
      </div>
    </section>

    <section class="bf-section" aria-labelledby="loop-title">
      <div class="bf-section-heading">
        <p class="bf-eyebrow">A reversible writing loop</p>
        <h2 id="loop-title">Import, write, inspect, export.</h2>
        <p>
          BranchForge works with the project you already have and gives it back
          in a Ren'Py-ready format.
        </p>
      </div>
      <ol class="bf-workflow">
        <li>
          <svg aria-hidden="true"><use href="#bf-box" /></svg
          ><strong>Import</strong
          ><span>Open a ZIP archive or pull a project from GitLab.</span>
        </li>
        <li>
          <svg aria-hidden="true"><use href="#bf-book" /></svg
          ><strong>Write</strong
          ><span>Shape dialogue or edit the source directly.</span>
        </li>
        <li>
          <svg aria-hidden="true"><use href="#bf-flow" /></svg
          ><strong>Inspect</strong
          ><span>Follow routes, labels, and pair endings.</span>
        </li>
        <li>
          <svg aria-hidden="true"><use href="#bf-git" /></svg
          ><strong>Export</strong
          ><span>Download a ZIP or push your changes to GitLab.</span>
        </li>
      </ol>
    </section>

    <section class="bf-section" aria-labelledby="tools-title">
      <div class="bf-section-heading">
        <p class="bf-eyebrow">Beyond the script editor</p>
        <h2 id="tools-title">Keep project context close.</h2>
      </div>
      <div class="bf-capability-grid">
        <a class="bf-capability" :href="characters"
          ><svg aria-hidden="true"><use href="#bf-users" /></svg>
          <h3>Characters and story state</h3>
          <p>
            Track characters, variables, stats, world details, and pair groups
            alongside your project.
          </p>
          <span
            >Explore story tools
            <svg aria-hidden="true"><use href="#bf-arrow" /></svg></span
        ></a>
        <a class="bf-capability" :href="importExport"
          ><svg aria-hidden="true"><use href="#bf-git" /></svg>
          <h3>Import and sync</h3>
          <p>
            Bring in existing scripts with ZIP or GitLab, then export a
            Ren'Py-compatible archive when you are ready.
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
        <h2 id="docker-title">Try BranchForge with Docker.</h2>
        <p>
          PostgreSQL, backend, and frontend run together. The installation guide
          covers environment variables and ports.
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
        <h2 id="status-title">What to expect from the beta.</h2>
      </div>
      <div class="bf-status-grid">
        <article>
          <svg aria-hidden="true"><use href="#bf-alert" /></svg>
          <h3>What is not ready yet</h3>
          <p>
            GitLab conflict review is read-only. Resolve conflicts in GitLab or
            locally before pulling again. Beta reader management, snippets, and
            the definitions import wizard are still planned.
          </p>
        </article>
        <article>
          <svg aria-hidden="true"><use href="#bf-git" /></svg>
          <h3>Open source by design</h3>
          <p>
            BranchForge is GPL v3. Contributions, issues, and feedback are
            welcome on GitHub.
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
      <p class="bf-eyebrow">Start with the project you have</p>
      <h2>Bring in your Ren'Py project and keep writing.</h2>
      <p>
        Learn what BranchForge imports, how it reads your scripts, and how to
        make your first project.
      </p>
      <a class="bf-button bf-button-primary" :href="firstProject"
        >Import your first project
        <svg aria-hidden="true"><use href="#bf-arrow" /></svg
      ></a>
    </section>
    <footer class="bf-footer">
      <p>BranchForge documentation · GPL v3 · beta software</p>
    </footer>
  </div>
</template>
