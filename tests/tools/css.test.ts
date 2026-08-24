/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {TextSnapshot} from '../../src/TextSnapshot.js';
import {getCssStyles} from '../../src/tools/css.js';
import {serverHooks} from '../server.js';
import {html, withMcpContext} from '../utils.js';

describe('css', () => {
  const server = serverHooks();

  it('retrieves inline and matched author styles with property status', async () => {
    server.addHtmlRoute(
      '/styles_test.html',
      html`
        <style>
          .btn-primary {
            color: blue;
            font-size: 14px;
          }
          #my-button {
            color: green;
          }
        </style>
        <button
          id="my-button"
          class="btn-primary"
          style="font-size: 16px; padding: 8px;"
        >
          Click Me
        </button>
      `,
    );

    await withMcpContext(async (response, context) => {
      const page = context.getSelectedMcpPage().pptrPage;
      await page.goto(server.getRoute('/styles_test.html'));

      context.getSelectedMcpPage().textSnapshot = await TextSnapshot.create(
        context.getSelectedMcpPage(),
      );

      const mcpPage = context.getSelectedMcpPage();
      let buttonUid: string | undefined;
      for (const [uid, node] of mcpPage.textSnapshot?.idToNode || []) {
        if (node.role === 'button' || node.name === 'Click Me') {
          buttonUid = uid;
          break;
        }
      }

      assert.ok(buttonUid, 'Button UID should be found in snapshot');

      await getCssStyles.handler(
        {
          params: {uid: buttonUid},
          page: mcpPage,
        },
        response,
        context,
      );

      const output = response.responseLines.join('\n');
      assert.ok(
        output.includes(
          'Styles for <button id="my-button" class="btn-primary">',
        ),
      );
      assert.ok(output.includes('Inline Styles:'));
      assert.ok(output.includes('font-size: 16px;'));
      assert.ok(output.includes('padding: 8px;'));
      assert.ok(output.includes('Matched Rules:'));
      assert.ok(output.includes('* #my-button'));
      assert.ok(output.includes('color: green;'));
      assert.ok(output.includes('* .btn-primary'));
      assert.ok(output.includes('font-size: 14px;'));
    });
  });

  it('correctly reports !important overrides over specificity', async () => {
    server.addHtmlRoute(
      '/important_test.html',
      html`
        <style>
          #submit-btn {
            display: none;
          }
          .force-visible {
            display: block !important;
          }
        </style>
        <button
          id="submit-btn"
          class="force-visible"
          >Submit</button
        >
      `,
    );

    await withMcpContext(async (response, context) => {
      const page = context.getSelectedMcpPage().pptrPage;
      await page.goto(server.getRoute('/important_test.html'));

      context.getSelectedMcpPage().textSnapshot = await TextSnapshot.create(
        context.getSelectedMcpPage(),
      );

      const mcpPage = context.getSelectedMcpPage();
      let buttonUid: string | undefined;
      for (const [uid, node] of mcpPage.textSnapshot?.idToNode || []) {
        if (node.role === 'button' || node.name === 'Submit') {
          buttonUid = uid;
          break;
        }
      }

      assert.ok(buttonUid, 'Button UID should be found in snapshot');

      await getCssStyles.handler(
        {
          params: {uid: buttonUid},
          page: mcpPage,
        },
        response,
        context,
      );

      const output = response.responseLines.join('\n');
      assert.ok(output.includes('* .force-visible'));
      assert.ok(output.includes('display: block !important;'));
      assert.ok(output.includes('* #submit-btn'));
      assert.ok(output.includes('display: none;'));
    });
  });

  it('returns inherited properties from ancestors while filtering non-inheritable ones', async () => {
    server.addHtmlRoute(
      '/inherited_test.html',
      html`
        <style>
          body {
            font-family: monospace;
            color: rgb(50, 50, 50);
            margin: 30px; /* non-inheritable */
          }
          .card {
            font-size: 18px;
            padding: 20px; /* non-inheritable */
          }
        </style>
        <div class="card">
          <p id="target-paragraph">Paragraph content</p>
        </div>
      `,
    );

    await withMcpContext(async (response, context) => {
      const page = context.getSelectedMcpPage().pptrPage;
      await page.goto(server.getRoute('/inherited_test.html'));

      context.getSelectedMcpPage().textSnapshot = await TextSnapshot.create(
        context.getSelectedMcpPage(),
      );

      const mcpPage = context.getSelectedMcpPage();
      let pUid: string | undefined;
      for (const [uid, node] of mcpPage.textSnapshot?.idToNode || []) {
        if (node.name?.includes('Paragraph content')) {
          pUid = uid;
          break;
        }
      }

      assert.ok(pUid, 'Paragraph UID should be found in snapshot');

      await getCssStyles.handler(
        {
          params: {uid: pUid},
          page: mcpPage,
        },
        response,
        context,
      );

      const output = response.responseLines.join('\n');
      assert.ok(output.includes('Inherited Styles:'));
      assert.ok(output.includes('font-family: monospace;'));
      // Non-inheritable properties on ancestors should be filtered out
      assert.ok(!output.includes('margin: 30px;'));
      assert.ok(!output.includes('padding: 20px;'));
    });
  });

  it('retrieves styles for pseudo-elements such as ::before and ::after', async () => {
    server.addHtmlRoute(
      '/pseudo_elements_test.html',
      html`
        <style>
          .tooltip::before {
            content: '⭐';
            color: gold;
            display: inline-block;
          }
          .tooltip::after {
            content: '🔍';
            font-size: 12px;
          }
        </style>
        <span class="tooltip">Helpful Info</span>
      `,
    );

    await withMcpContext(async (response, context) => {
      const page = context.getSelectedMcpPage().pptrPage;
      await page.goto(server.getRoute('/pseudo_elements_test.html'));

      context.getSelectedMcpPage().textSnapshot = await TextSnapshot.create(
        context.getSelectedMcpPage(),
      );

      const mcpPage = context.getSelectedMcpPage();
      let spanUid: string | undefined;
      for (const [uid, node] of mcpPage.textSnapshot?.idToNode || []) {
        if (node.name?.includes('Helpful Info') || node.role === 'generic') {
          spanUid = uid;
          break;
        }
      }

      assert.ok(spanUid, 'Span UID should be found');

      await getCssStyles.handler(
        {
          params: {uid: spanUid},
          page: mcpPage,
        },
        response,
        context,
      );

      const output = response.responseLines.join('\n');
      assert.ok(output.includes('Pseudo-element ::before:'));
      assert.ok(output.includes('* .tooltip::before'));
      assert.ok(output.includes('color: gold;'));
      assert.ok(output.includes('Pseudo-element ::after:'));
      assert.ok(output.includes('* .tooltip::after'));
      assert.ok(output.includes('font-size: 12px;'));
    });
  });

  it('retrieves active pseudo-class styles when element state is triggered', async () => {
    server.addHtmlRoute(
      '/pseudo_classes_test.html',
      html`
        <style>
          .interactive-btn {
            background-color: white;
            color: black;
          }
          .interactive-btn:focus {
            outline: 2px solid red;
            background-color: yellow;
          }
        </style>
        <button
          id="test-btn"
          class="interactive-btn"
          >Action Button</button
        >
      `,
    );

    await withMcpContext(async (response, context) => {
      const page = context.getSelectedMcpPage().pptrPage;
      await page.goto(server.getRoute('/pseudo_classes_test.html'));

      // Trigger :focus on the button
      await page.focus('#test-btn');

      context.getSelectedMcpPage().textSnapshot = await TextSnapshot.create(
        context.getSelectedMcpPage(),
      );

      const mcpPage = context.getSelectedMcpPage();
      let btnUid: string | undefined;
      for (const [uid, node] of mcpPage.textSnapshot?.idToNode || []) {
        if (node.role === 'button' || node.name === 'Action Button') {
          btnUid = uid;
          break;
        }
      }

      assert.ok(btnUid, 'Button UID should be found');

      await getCssStyles.handler(
        {
          params: {uid: btnUid},
          page: mcpPage,
        },
        response,
        context,
      );

      const output = response.responseLines.join('\n');
      assert.ok(output.includes('* .interactive-btn:focus'));
      assert.ok(
        output.includes('outline: 2px solid red;') ||
          output.includes('outline: red solid 2px;'),
      );
      assert.ok(output.includes('background-color: yellow;'));
    });
  });

  it('retrieves styles for nodes inside open shadow roots', async () => {
    server.addHtmlRoute(
      '/open_shadow_test.html',
      html`
        <div id="open-host"></div>
        <script>
          const openHost = document.getElementById('open-host');
          const openRoot = openHost.attachShadow({mode: 'open'});
          openRoot.innerHTML = \`
            <style>
              .shadow-btn-open {
                color: rgb(100, 200, 50);
                font-weight: bold;
              }
            </style>
            <button class="shadow-btn-open">Open Shadow Button</button>
          \`;
        </script>
      `,
    );

    await withMcpContext(async (response, context) => {
      const page = context.getSelectedMcpPage().pptrPage;
      await page.goto(server.getRoute('/open_shadow_test.html'));

      context.getSelectedMcpPage().textSnapshot = await TextSnapshot.create(
        context.getSelectedMcpPage(),
      );

      const mcpPage = context.getSelectedMcpPage();
      let openBtnUid: string | undefined;
      for (const [uid, node] of mcpPage.textSnapshot?.idToNode || []) {
        if (node.name === 'Open Shadow Button') {
          openBtnUid = uid;
          break;
        }
      }

      assert.ok(openBtnUid, 'Open shadow button UID should be found');

      await getCssStyles.handler(
        {
          params: {uid: openBtnUid},
          page: mcpPage,
        },
        response,
        context,
      );

      const openOutput = response.responseLines.join('\n');
      assert.ok(openOutput.includes('* .shadow-btn-open'));
      assert.ok(openOutput.includes('color: rgb(100, 200, 50);'));
    });
  });

  it('retrieves styles for nodes inside closed shadow roots', async () => {
    server.addHtmlRoute(
      '/closed_shadow_test.html',
      html`
        <div id="closed-host"></div>
        <script>
          const closedHost = document.getElementById('closed-host');
          const closedRoot = closedHost.attachShadow({mode: 'closed'});
          closedRoot.innerHTML = \`
            <style>
              .shadow-btn-closed {
                color: rgb(200, 50, 100);
                font-style: italic;
              }
            </style>
            <button class="shadow-btn-closed">Closed Shadow Button</button>
          \`;
        </script>
      `,
    );

    await withMcpContext(async (response, context) => {
      const page = context.getSelectedMcpPage().pptrPage;
      await page.goto(server.getRoute('/closed_shadow_test.html'));

      context.getSelectedMcpPage().textSnapshot = await TextSnapshot.create(
        context.getSelectedMcpPage(),
      );

      const mcpPage = context.getSelectedMcpPage();
      let closedBtnUid: string | undefined;
      for (const [uid, node] of mcpPage.textSnapshot?.idToNode || []) {
        if (node.name === 'Closed Shadow Button') {
          closedBtnUid = uid;
          break;
        }
      }

      assert.ok(closedBtnUid, 'Closed shadow button UID should be found');

      await getCssStyles.handler(
        {
          params: {uid: closedBtnUid},
          page: mcpPage,
        },
        response,
        context,
      );

      const closedOutput = response.responseLines.join('\n');
      assert.ok(closedOutput.includes('* .shadow-btn-closed'));
      assert.ok(closedOutput.includes('color: rgb(200, 50, 100);'));
    });
  });

  it('retrieves styles for nodes inside iframes', async () => {
    server.addHtmlRoute(
      '/iframe_content.html',
      html`
        <style>
          .frame-btn {
            background-color: purple;
            color: white;
          }
        </style>
        <button
          id="iframe-btn"
          class="frame-btn"
          >Iframe Button</button
        >
      `,
    );

    server.addHtmlRoute(
      '/iframe_host.html',
      html`
        <h1>Main Host</h1>
        <iframe
          id="child-frame"
          src="/iframe_content.html"
        ></iframe>
      `,
    );

    await withMcpContext(async (response, context) => {
      const page = context.getSelectedMcpPage().pptrPage;
      await page.goto(server.getRoute('/iframe_host.html'));
      await page.waitForSelector('iframe');

      context.getSelectedMcpPage().textSnapshot = await TextSnapshot.create(
        context.getSelectedMcpPage(),
      );

      const mcpPage = context.getSelectedMcpPage();
      let frameBtnUid: string | undefined;
      for (const [uid, node] of mcpPage.textSnapshot?.idToNode || []) {
        if (node.name === 'Iframe Button') {
          frameBtnUid = uid;
          break;
        }
      }

      assert.ok(frameBtnUid, 'Iframe button UID should be found');

      await getCssStyles.handler(
        {
          params: {uid: frameBtnUid},
          page: mcpPage,
        },
        response,
        context,
      );

      const output = response.responseLines.join('\n');
      assert.ok(output.includes('* .frame-btn'));
      assert.ok(output.includes('background-color: purple;'));
    });
  });

  it('retrieves styles for nodes inside cross-origin iframes', async () => {
    server.addHtmlRoute(
      '/cross_iframe_content.html',
      html`
        <style>
          .cross-frame-btn {
            background-color: teal;
            color: white;
          }
        </style>
        <button
          id="cross-iframe-btn"
          class="cross-frame-btn"
        >
          Cross Iframe Button
        </button>
      `,
    );

    const crossOriginUrl = server
      .getRoute('/cross_iframe_content.html')
      .replace('localhost', '127.0.0.1');

    server.addHtmlRoute(
      '/cross_iframe_host.html',
      html`
        <h1>Main Host</h1>
        <iframe
          id="cross-child-frame"
          src="${crossOriginUrl}"
        ></iframe>
      `,
    );

    await withMcpContext(async (response, context) => {
      const page = context.getSelectedMcpPage().pptrPage;
      await page.goto(server.getRoute('/cross_iframe_host.html'));
      await page.waitForSelector('iframe');

      context.getSelectedMcpPage().textSnapshot = await TextSnapshot.create(
        context.getSelectedMcpPage(),
      );

      const mcpPage = context.getSelectedMcpPage();
      let frameBtnUid: string | undefined;
      for (const [uid, node] of mcpPage.textSnapshot?.idToNode || []) {
        if (node.name === 'Cross Iframe Button') {
          frameBtnUid = uid;
          break;
        }
      }

      assert.ok(frameBtnUid, 'Cross-origin iframe button UID should be found');

      await getCssStyles.handler(
        {
          params: {uid: frameBtnUid},
          page: mcpPage,
        },
        response,
        context,
      );

      const output = response.responseLines.join('\n');
      assert.ok(output.includes('* .cross-frame-btn'));
      assert.ok(output.includes('background-color: teal;'));
    });
  });

  it('fails gracefully when snapshot is missing or UID is invalid', async () => {
    await withMcpContext(async (response, context) => {
      const mcpPage = context.getSelectedMcpPage();
      mcpPage.textSnapshot = null;

      await assert.rejects(
        async () => {
          await getCssStyles.handler(
            {
              params: {uid: 'non_existent_uid'},
              page: mcpPage,
            },
            response,
            context,
          );
        },
        {
          message: /No snapshot found for page/,
        },
      );
    });
  });
});
