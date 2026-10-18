/**
 * XMind fixtures, written by hand to the layouts XMind actually produces rather than exported from
 * the application, so the suite states what the reader is contracted to understand and a change to
 * the fixture is a change to that contract.
 *
 * The two files describe the same map: the current `content.json` and the legacy `content.xml` a
 * student's older files still carry. Both hold two sheets, notes, an http link, a link in a scheme
 * that must be dropped, a mailto link, markers, a folded branch, a floating topic, a relationship
 * whose ends both exist and one whose second end does not, and a title full of markup.
 */

/** Current format: an array of sheets, each with a `rootTopic`. */
export const CURRENT_CONTENT_JSON = JSON.stringify([
  {
    id: 'sheet-1',
    class: 'sheet',
    title: 'Essay plan',
    rootTopic: {
      id: 'root-1',
      title: 'Climate policy essay',
      style: { id: 'style-1', properties: { 'svg:fill': '#0c66d0' } },
      children: {
        attached: [
          {
            id: 't-intro',
            title: 'Introduction',
            notes: { plain: { content: 'Open with the 2026 target.' } },
            markerRefs: [{ markerId: 'priority-1' }],
            children: {
              attached: [
                { id: 't-hook', title: 'Hook', href: 'https://example.org/hook' },
                { id: 't-thesis', title: 'Thesis', href: 'xmind:#t-hook' },
              ],
            },
          },
          {
            id: 't-evidence',
            title: 'Evidence',
            branch: 'folded',
            markerRefs: [{ markerId: 'task-done' }, { markerId: 'star-blue' }],
            children: {
              attached: [
                {
                  id: 't-ipcc',
                  title: 'IPCC AR7',
                  style: { id: 'style-2', properties: { 'svg:fill': '#0a7d0c' } },
                },
                {
                  id: 't-email',
                  title: '<script>alert(1)</script> Email the tutor',
                  href: 'mailto:tutor@example.ac.uk',
                },
              ],
            },
          },
        ],
        detached: [{ id: 't-float', title: 'Ask the tutor about word count' }],
      },
    },
    relationships: [
      { id: 'rel-1', end1Id: 't-thesis', end2Id: 't-ipcc', title: 'supported by' },
      { id: 'rel-2', end1Id: 't-thesis', end2Id: 'nowhere' },
    ],
  },
  {
    id: 'sheet-2',
    class: 'sheet',
    title: 'Reading list',
    rootTopic: { id: 'root-2', title: 'Reading' },
  },
]);

/** Legacy format: the same map as XMind 8 wrote it. */
export const LEGACY_CONTENT_XML = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<xmap-content xmlns="urn:xmind:xmap:xmlns:content:2.0"
              xmlns:xlink="http://www.w3.org/1999/xlink" version="2.0">
  <sheet id="sheet-1">
    <topic id="root-1">
      <title>Climate policy essay</title>
      <children>
        <topics type="attached">
          <topic id="t-intro">
            <title>Introduction</title>
            <notes><plain>Open with the 2026 target.</plain></notes>
            <marker-refs><marker-ref marker-id="priority-1"/></marker-refs>
            <children>
              <topics type="attached">
                <topic id="t-hook" xlink:href="https://example.org/hook"><title>Hook</title></topic>
                <topic id="t-thesis" xlink:href="xmind:#t-hook"><title>Thesis</title></topic>
              </topics>
            </children>
          </topic>
          <topic id="t-evidence" branch="folded">
            <title>Evidence</title>
            <marker-refs>
              <marker-ref marker-id="task-done"/>
              <marker-ref marker-id="star-blue"/>
            </marker-refs>
            <children>
              <topics type="attached">
                <topic id="t-ipcc"><title>IPCC AR7</title></topic>
                <topic id="t-email" xlink:href="mailto:tutor@example.ac.uk">
                  <title>&lt;script&gt;alert(1)&lt;/script&gt; Email the tutor</title>
                </topic>
              </topics>
            </children>
          </topic>
        </topics>
        <topics type="detached">
          <topic id="t-float"><title>Ask the tutor about word count</title></topic>
        </topics>
      </children>
    </topic>
    <title>Essay plan</title>
    <relationships>
      <relationship id="rel-1" end1="t-thesis" end2="t-ipcc"><title>supported by</title></relationship>
      <relationship id="rel-2" end1="t-thesis" end2="nowhere"/>
    </relationships>
  </sheet>
  <sheet id="sheet-2">
    <topic id="root-2"><title>Reading</title></topic>
    <title>Reading list</title>
  </sheet>
</xmap-content>
`;
