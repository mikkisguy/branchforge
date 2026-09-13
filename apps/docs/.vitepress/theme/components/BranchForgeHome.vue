<script setup lang="ts">
const repoUrl = "https://github.com/mikkisguy/branchforge";
</script>

<template>
  <div class="bf-home">
    <header class="bf-nav">
      <a class="bf-brand" href="/">
        <img src="/favicon.png" alt="BranchForge" width="40" height="40" />
        <span>BranchForge</span>
      </a>
      <nav class="bf-nav-links" aria-label="Primary">
        <a href="/user/getting-started">User Guide</a>
        <a href="/dev/architecture">Developer Guide</a>
        <a :href="repoUrl" target="_blank" rel="noreferrer">GitHub</a>
      </nav>
    </header>

    <section class="bf-hero">
      <div class="bf-hero-copy">
        <p class="bf-badge">Beta · import-first workspace</p>
        <h1>Write branching Ren'Py stories with clarity</h1>
        <p class="bf-lead">
          BranchForge is a creative workspace for visual novel authors. Import
          an existing Ren'Py project, write in a calm editor, visualize every
          branch, and export when you are ready.
        </p>
        <div class="bf-hero-actions">
          <a class="bf-btn bf-btn-primary" href="/user/getting-started">
            Get Started
          </a>
          <a class="bf-btn bf-btn-secondary" href="/dev/architecture">
            Developer Guide
          </a>
        </div>
      </div>

      <div class="bf-branch-visual" aria-hidden="true">
        <div class="bf-node bf-node-root">Start</div>
        <div class="bf-branch-lines">
          <div class="bf-branch-col">
            <div class="bf-line"></div>
            <div class="bf-node">Route A</div>
          </div>
          <div class="bf-branch-col">
            <div class="bf-line"></div>
            <div class="bf-node">Route B</div>
          </div>
        </div>
        <div class="bf-rejoin">
          <div class="bf-line bf-line-short"></div>
          <div class="bf-node bf-node-shared">Shared reunion</div>
        </div>
      </div>
    </section>

    <section class="bf-section">
      <h2>Import → Write → Visualize → Export</h2>
      <ol class="bf-workflow">
        <li>
          <strong>Import</strong>
          <span
            >Bring in a ZIP or pull from GitLab — projects are never created
            empty.</span
          >
        </li>
        <li>
          <strong>Write</strong>
          <span
            >Draft dialogue in Write Mode or edit raw `.rpy` in Script
            Mode.</span
          >
        </li>
        <li>
          <strong>Visualize</strong>
          <span>Explore FLOW, ROUTE, and FILE layouts in the flow graph.</span>
        </li>
        <li>
          <strong>Export</strong>
          <span
            >Download a Ren'Py-ready ZIP or push changes back to GitLab.</span
          >
        </li>
      </ol>
    </section>

    <section class="bf-section bf-grid">
      <article class="bf-card">
        <h3>Writing workspace</h3>
        <ul>
          <li>Distraction-free Write Mode with autosave</li>
          <li>Script Mode with Ren'Py syntax highlighting</li>
          <li>Technical badges that mirror your source</li>
        </ul>
      </article>
      <article class="bf-card">
        <h3>Structure &amp; flow</h3>
        <ul>
          <li>Interactive flow graph with three layout modes</li>
          <li>Route configurations and label visibility</li>
          <li>File tree for multi-file projects</li>
        </ul>
      </article>
      <article class="bf-card">
        <h3>Story state</h3>
        <ul>
          <li>Characters, variables, and stats</li>
          <li>World bible for locations and concepts</li>
          <li>Pair groups for duo endings</li>
        </ul>
      </article>
      <article class="bf-card">
        <h3>Import &amp; sync</h3>
        <ul>
          <li>ZIP import and export</li>
          <li>GitLab pull and push with conflict detection</li>
          <li>Read-only conflict review in this beta</li>
        </ul>
      </article>
    </section>

    <section class="bf-section bf-docker">
      <div>
        <h2>Try it with Docker</h2>
        <p>
          PostgreSQL 18, backend, and frontend run together with one command.
          See the installation guide for environment variables and ports.
        </p>
        <a
          class="bf-btn bf-btn-primary"
          href="/user/getting-started#quick-start-with-docker-recommended"
        >
          Installation guide
        </a>
      </div>
      <pre
        class="bf-code"
      ><code>git clone https://github.com/mikkisguy/branchforge.git
cd branchforge
cp .env.example .env
docker compose up -d</code></pre>
    </section>

    <section class="bf-section bf-note">
      <h2>Honest beta notes</h2>
      <p>
        BranchForge is in <strong>beta</strong> — usable for the solo writing
        loop, but still evolving. GitLab conflict <em>review</em> is read-only:
        you can inspect conflicts in the app, but applying resolutions must
        happen in GitLab or locally before pulling again.
      </p>
      <p>
        Post-v1 features such as beta reader management, Ren'Py snippets, and
        the definitions import wizard are not part of this release.
      </p>
    </section>

    <section class="bf-section bf-oss">
      <h2>Open source</h2>
      <p>
        BranchForge is GPL v3. Contributions, issues, and feedback are welcome
        on GitHub.
      </p>
      <a
        class="bf-btn bf-btn-secondary"
        :href="repoUrl"
        target="_blank"
        rel="noreferrer"
      >
        View repository
      </a>
    </section>

    <section class="bf-cta">
      <h2>Ready to import your first project?</h2>
      <a class="bf-btn bf-btn-primary" href="/user/projects"
        >Your first project</a
      >
    </section>

    <footer class="bf-footer">
      <p>BranchForge documentation · beta software · use at your own risk</p>
    </footer>
  </div>
</template>
