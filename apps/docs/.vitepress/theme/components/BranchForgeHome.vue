<script setup lang="ts">
import { withBase } from "vitepress";

const repoUrl = "https://github.com/mikkisguy/branchforge";
const gettingStarted = withBase("/user/getting-started");
const firstProject = withBase("/user/projects");
const changelog = withBase("/changelog");
const installAnchor = withBase(
  "/user/getting-started#quick-start-with-docker-recommended"
);
</script>

<template>
  <div class="bf-home">
    <svg class="bf-icon-sprite" aria-hidden="true">
      <symbol id="bf-icon-arrow" viewBox="0 0 24 24">
        <path d="M5 12h14" />
        <path d="m13 6 6 6-6 6" />
      </symbol>
      <symbol id="bf-icon-book" viewBox="0 0 24 24">
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2Z" />
        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7Z" />
      </symbol>
      <symbol id="bf-icon-code" viewBox="0 0 24 24">
        <path d="m8 9-3 3 3 3" />
        <path d="m16 9 3 3-3 3" />
        <path d="m14 5-4 14" />
      </symbol>
      <symbol id="bf-icon-network" viewBox="0 0 24 24">
        <rect width="6" height="6" x="9" y="2" rx="1" />
        <rect width="6" height="6" x="16" y="16" rx="1" />
        <rect width="6" height="6" x="2" y="16" rx="1" />
        <path d="M12 8v4m-7 4v-2h14v2" />
      </symbol>
      <symbol id="bf-icon-package" viewBox="0 0 24 24">
        <path
          d="m7.5 4.27 9 5.15M3.29 7 12 12l8.71-5M12 22V12M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"
        />
      </symbol>
      <symbol id="bf-icon-git" viewBox="0 0 24 24">
        <circle cx="6" cy="5" r="3" />
        <circle cx="18" cy="6" r="3" />
        <circle cx="6" cy="19" r="3" />
        <path d="M6 8v8m9-10h-1a8 8 0 0 0-8 8" />
      </symbol>
      <symbol id="bf-icon-users" viewBox="0 0 24 24">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </symbol>
      <symbol id="bf-icon-sparkles" viewBox="0 0 24 24">
        <path
          d="m12 3-1.9 4.8a2 2 0 0 1-1.13 1.13L4 11l4.97 2.07a2 2 0 0 1 1.13 1.13L12 19l1.9-4.8a2 2 0 0 1 1.13-1.13L20 11l-4.97-2.07a2 2 0 0 1-1.13-1.13Z"
        />
        <path d="M5 3v4M3 5h4m12 12v4m-2-2h4" />
      </symbol>
      <symbol id="bf-icon-terminal" viewBox="0 0 24 24">
        <path d="m4 17 6-6-6-6m8 14h8" />
      </symbol>
      <symbol id="bf-icon-github" viewBox="0 0 24 24">
        <path
          d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3.3-.4 6.8-1.6 6.8-7A5.4 5.4 0 0 0 19.3 4 5 5 0 0 0 19.2.5S18 0 15 2a13.4 13.4 0 0 0-7 0C5-.1 3.8.5 3.8.5A5 5 0 0 0 3.7 4a5.4 5.4 0 0 0-1.5 3.7c0 5.3 3.5 6.5 6.8 7-.7.6-1 1.6-1 2.5V22M8 19c-3 .9-3-1.5-4-2"
        />
      </symbol>
      <symbol id="bf-icon-alert" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4m0 4h.01" />
      </symbol>
      <symbol id="bf-icon-check" viewBox="0 0 24 24">
        <path d="m5 12 4 4L19 6" />
      </symbol>
    </svg>

    <section class="bf-hero">
      <div class="bf-hero-copy">
        <p class="bf-badge">
          <span class="bf-status-dot"></span>
          Open source · v1.0 beta
        </p>
        <h1>Write branching Ren'Py stories with clarity</h1>
        <p class="bf-lead">
          A calm creative workspace for visual novel authors. Draft dialogue,
          inspect every route, and keep the Ren'Py source close without letting
          it interrupt your writing flow.
        </p>
        <div class="bf-hero-actions">
          <a class="bf-btn bf-btn-primary" :href="gettingStarted">
            Get started
            <svg class="bf-btn-icon" aria-hidden="true">
              <use href="#bf-icon-arrow" />
            </svg>
          </a>
          <a class="bf-btn bf-btn-secondary" :href="changelog"> What's new </a>
        </div>
        <ul class="bf-hero-details" aria-label="BranchForge highlights">
          <li>
            <svg aria-hidden="true"><use href="#bf-icon-check" /></svg>
            Self-hosted
          </li>
          <li>
            <svg aria-hidden="true"><use href="#bf-icon-check" /></svg>
            ZIP import
          </li>
          <li>
            <svg aria-hidden="true"><use href="#bf-icon-check" /></svg>
            GitLab sync
          </li>
        </ul>
      </div>

      <div class="bf-product" aria-hidden="true">
        <div class="bf-product-glow"></div>
        <div class="bf-app-preview">
          <div class="bf-app-bar">
            <div class="bf-window-dots">
              <span></span><span></span><span></span>
            </div>
            <strong>BranchForge</strong>
            <div class="bf-app-views">
              <span class="is-active">Write</span>
              <span>Script</span>
              <span>Flow</span>
            </div>
          </div>
          <div class="bf-app-body">
            <aside class="bf-app-sidebar">
              <span class="bf-app-sidebar-title">STORY</span>
              <span class="bf-app-file is-active">
                <i></i>
                chapter-one
              </span>
              <span class="bf-app-file"><i></i>first-meeting</span>
              <span class="bf-app-file"><i></i>garden-route</span>
              <span class="bf-app-file"><i></i>final-choice</span>
            </aside>
            <div class="bf-app-editor">
              <div class="bf-app-editor-top">
                <span>chapter-one</span>
                <span class="bf-draft-pill">Draft</span>
              </div>
              <div class="bf-dialogue">
                <span class="bf-character-chip bf-character-chip-a">A</span>
                <div>
                  <strong>Avery</strong>
                  <p>I thought I would find you here.</p>
                </div>
              </div>
              <div class="bf-dialogue">
                <span class="bf-character-chip bf-character-chip-b">M</span>
                <div>
                  <strong>Morgan</strong>
                  <p>Then you already know what I decided.</p>
                </div>
              </div>
              <div class="bf-choice-preview">
                <span>CHOICE</span>
                <p>Ask them to stay</p>
                <p>Let the moment pass</p>
              </div>
            </div>
            <aside class="bf-app-inspector">
              <span class="bf-app-sidebar-title">LABEL</span>
              <strong>chapter-one</strong>
              <div class="bf-inspector-stat">
                <span>Lines</span>
                <b>18</b>
              </div>
              <div class="bf-inspector-stat">
                <span>Choices</span>
                <b>2</b>
              </div>
              <div class="bf-route-line"></div>
              <span class="bf-route-label">2 outgoing routes</span>
            </aside>
          </div>
          <div class="bf-app-status">
            <span><i></i> All changes saved</span>
            <span>284 words</span>
          </div>
        </div>
      </div>
    </section>

    <section class="bf-release" aria-labelledby="release-title">
      <div class="bf-release-icon">
        <svg aria-hidden="true"><use href="#bf-icon-sparkles" /></svg>
      </div>
      <div class="bf-release-copy">
        <p class="bf-kicker">What's new</p>
        <h2 id="release-title">A unified workspace in v1.0.0-beta.3</h2>
        <p>
          Write, Script, and Flow now live together in a calmer, more consistent
          interface.
        </p>
      </div>
      <a class="bf-text-link" :href="changelog">
        Read the Changelog
        <svg aria-hidden="true"><use href="#bf-icon-arrow" /></svg>
      </a>
    </section>

    <section class="bf-section">
      <div class="bf-section-heading">
        <p class="bf-eyebrow">Your whole story, one workspace</p>
        <h2>Three modes, one story</h2>
        <p>
          Switch between prose, raw script, and structure without leaving the
          writing flow.
        </p>
      </div>
      <div class="bf-modes">
        <article class="bf-mode-card">
          <div class="bf-mode-icon">
            <svg aria-hidden="true"><use href="#bf-icon-book" /></svg>
          </div>
          <div class="bf-mode-chip">Write</div>
          <h3>Calm dialogue editing</h3>
          <p>
            Draft narration and character lines in a focused editor. Technical
            details stay visible as display-only badges so the prose stays
            readable.
          </p>
        </article>
        <article class="bf-mode-card">
          <div class="bf-mode-icon">
            <svg aria-hidden="true"><use href="#bf-icon-code" /></svg>
          </div>
          <div class="bf-mode-chip">Script</div>
          <h3>Raw `.rpy` when you need it</h3>
          <p>
            Edit conditions, menus, jumps, variables, and the rest of your
            Ren'Py source with syntax highlighting and a clear file tree.
          </p>
        </article>
        <article class="bf-mode-card">
          <div class="bf-mode-icon">
            <svg aria-hidden="true"><use href="#bf-icon-network" /></svg>
          </div>
          <div class="bf-mode-chip">Flow</div>
          <h3>See the branches</h3>
          <p>
            Explore FLOW, ROUTE, and FILE layouts to understand how labels
            connect — rearrange the view without changing your script.
          </p>
        </article>
      </div>
    </section>

    <section class="bf-section">
      <div class="bf-section-heading">
        <p class="bf-eyebrow">A reversible creative loop</p>
        <h2>Import, write, visualize, export</h2>
        <p>
          BranchForge works with the project you already have and gives it back
          in a Ren'Py-ready format.
        </p>
      </div>
      <ol class="bf-workflow">
        <li>
          <svg aria-hidden="true"><use href="#bf-icon-package" /></svg>
          <strong>Import</strong>
          <span>Open a ZIP archive or pull a project from GitLab.</span>
        </li>
        <li>
          <svg aria-hidden="true"><use href="#bf-icon-book" /></svg>
          <strong>Write</strong>
          <span>Shape dialogue or edit the Ren'Py source directly.</span>
        </li>
        <li>
          <svg aria-hidden="true"><use href="#bf-icon-network" /></svg>
          <strong>Visualize</strong>
          <span>Follow routes, shared labels, and pair endings.</span>
        </li>
        <li>
          <svg aria-hidden="true"><use href="#bf-icon-git" /></svg>
          <strong>Export</strong>
          <span>Download a Ren'Py-ready ZIP or push back to GitLab.</span>
        </li>
      </ol>
    </section>

    <section class="bf-section">
      <div class="bf-section-heading">
        <p class="bf-eyebrow">Built for branching narratives</p>
        <h2>Keep branching narratives organized</h2>
      </div>
      <div class="bf-grid">
        <article class="bf-card bf-card-featured">
          <div class="bf-card-icon">
            <svg aria-hidden="true"><use href="#bf-icon-book" /></svg>
          </div>
          <h3>Writing workspace</h3>
          <p>Keep prose readable while the technical context stays nearby.</p>
          <ul>
            <li>Distraction-free Write Mode with autosave</li>
            <li>Script Mode with Ren'Py syntax highlighting</li>
            <li>Display-only technical badges beside dialogue</li>
          </ul>
        </article>
        <article class="bf-card">
          <div class="bf-card-icon">
            <svg aria-hidden="true"><use href="#bf-icon-network" /></svg>
          </div>
          <h3>Structure &amp; flow</h3>
          <ul>
            <li>Flow graph with FLOW, ROUTE, and FILE layouts</li>
            <li>Route configuration and label visibility</li>
            <li>File tree for multi-file projects</li>
          </ul>
        </article>
        <article class="bf-card">
          <div class="bf-card-icon">
            <svg aria-hidden="true"><use href="#bf-icon-users" /></svg>
          </div>
          <h3>Story state</h3>
          <ul>
            <li>Characters, variables, and stats</li>
            <li>World bible for locations and concepts</li>
            <li>Pair groups for duo endings</li>
          </ul>
        </article>
        <article class="bf-card">
          <div class="bf-card-icon">
            <svg aria-hidden="true"><use href="#bf-icon-git" /></svg>
          </div>
          <h3>Import &amp; sync</h3>
          <ul>
            <li>ZIP import and export</li>
            <li>GitLab pull and push with conflict detection</li>
            <li>Conflict review is read-only in this beta</li>
          </ul>
        </article>
      </div>
    </section>

    <section class="bf-section bf-docker">
      <div>
        <div class="bf-section-icon">
          <svg aria-hidden="true"><use href="#bf-icon-terminal" /></svg>
        </div>
        <h2>Try it with Docker</h2>
        <p>
          PostgreSQL, backend, and frontend run together with one command. See
          the installation guide for environment variables and ports.
        </p>
        <a class="bf-btn bf-btn-primary" :href="installAnchor">
          Installation guide
          <svg class="bf-btn-icon" aria-hidden="true">
            <use href="#bf-icon-arrow" />
          </svg>
        </a>
      </div>
      <pre
        class="bf-code"
      ><code>git clone https://github.com/mikkisguy/branchforge.git
cd branchforge
cp .env.example .env
docker compose up -d</code></pre>
    </section>

    <section class="bf-section bf-info-grid">
      <article class="bf-info-card">
        <div class="bf-info-card-heading">
          <div class="bf-card-icon bf-card-icon-warm">
            <svg aria-hidden="true"><use href="#bf-icon-alert" /></svg>
          </div>
          <h2>Honest beta notes</h2>
        </div>
        <p>
          The solo writing loop is ready, but BranchForge is still evolving.
          GitLab conflict review is read-only: apply resolutions in GitLab or
          locally before pulling again.
        </p>
        <p class="bf-small">
          Beta reader management, snippets, and the definitions import wizard
          are planned beyond v1.
        </p>
      </article>
      <article class="bf-info-card">
        <div class="bf-info-card-heading">
          <div class="bf-card-icon">
            <svg aria-hidden="true"><use href="#bf-icon-github" /></svg>
          </div>
          <h2>Open by design</h2>
        </div>
        <p>
          BranchForge is GPL v3. Contributions, issues, and feedback are welcome
          on GitHub.
        </p>
        <a
          class="bf-text-link"
          :href="repoUrl"
          target="_blank"
          rel="noreferrer"
        >
          View repository
          <svg aria-hidden="true"><use href="#bf-icon-arrow" /></svg>
        </a>
      </article>
    </section>

    <section class="bf-cta">
      <p class="bf-eyebrow">Your story already has branches</p>
      <h2>Ready to bring in your Ren'Py project?</h2>
      <p>Start locally, import your project, and keep writing.</p>
      <div class="bf-hero-actions bf-cta-actions">
        <a class="bf-btn bf-btn-primary" :href="gettingStarted">
          Install locally
          <svg class="bf-btn-icon" aria-hidden="true">
            <use href="#bf-icon-arrow" />
          </svg>
        </a>
        <a class="bf-btn bf-btn-secondary" :href="firstProject">
          Your first project
        </a>
      </div>
    </section>

    <footer class="bf-footer">
      <p>BranchForge documentation · beta software · use at your own risk</p>
    </footer>
  </div>
</template>
