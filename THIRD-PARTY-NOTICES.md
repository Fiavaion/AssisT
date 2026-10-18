# Third-Party Notices

AssisT is licensed under the EUPL-1.2 (see [LICENSE](LICENSE)). It bundles the third-party
open-source components listed below. Each remains under its own licence; those licences are
reproduced or referenced here, and their full texts also ship inside each package's `LICENSE`
file. The table lists the runtime dependencies named in `package.json` and `tesseract.js-core`, which
tesseract.js loads. Fonts and the WebLLM model libraries follow in their own sections.

## Bundled components

| Component              | Version | Licence                 | Copyright / Author                                                      | Project                                          |
| ---------------------- | ------- | ----------------------- | ----------------------------------------------------------------------- | ------------------------------------------------ |
| @mlc-ai/web-llm        | 0.2.81  | Apache-2.0              | -                                                                       | https://github.com/mlc-ai/web-llm                |
| @mozilla/readability   | 0.6.0   | Apache-2.0              | -                                                                       | https://github.com/mozilla/readability           |
| @tesseract.js-data/eng | 1.0.0   | MIT                     | Balearica, jeromewu                                                     | https://github.com/naptha/tessdata               |
| compromise             | 14.14.4 | MIT                     | Spencer Kelly <spencermountain@gmail.com> (http://spencermounta.in)     | https://github.com/spencermountain/compromise    |
| crypto-js              | 4.2.0   | MIT                     | Evan Vosberg (http://github.com/evanvosberg)                            | http://github.com/brix/crypto-js                 |
| d3-drag                | 3.0.0   | ISC                     | Mike Bostock (https://bost.ocks.org/mike)                               | https://d3js.org/d3-drag/                        |
| d3-force               | 3.0.0   | ISC                     | Mike Bostock (https://bost.ocks.org/mike)                               | https://d3js.org/d3-force/                       |
| d3-selection           | 3.0.0   | ISC                     | Mike Bostock (https://bost.ocks.org/mike)                               | https://d3js.org/d3-selection/                   |
| d3-zoom                | 3.0.0   | ISC                     | Mike Bostock (https://bost.ocks.org/mike)                               | https://d3js.org/d3-zoom/                        |
| dexie                  | 3.2.7   | Apache-2.0              | David Fahlander <https://github.com/dfahlander>                         | https://dexie.org                                |
| dompurify              | 3.4.2   | (MPL-2.0 OR Apache-2.0) | Dr.-Ing. Mario Heiderich, Cure53 <mario@cure53.de> (https://cure53.de/) | https://github.com/cure53/DOMPurify              |
| open-graph-scraper     | 6.10.0  | MIT                     | Josh Shemas (https://github.com/jshemas)                                | https://github.com/jshemas/openGraphScraper      |
| pdfjs-dist             | 5.4.394 | Apache-2.0              | -                                                                       | https://mozilla.github.io/pdf.js/                |
| sortablejs             | 1.15.6  | MIT                     | -                                                                       | https://github.com/SortableJS/Sortable           |
| speech-rule-engine     | 4.1.4   | Apache-2.0              | -                                                                       | https://github.com/zorkow/speech-rule-engine     |
| tesseract.js           | 5.1.1   | Apache-2.0              | -                                                                       | https://github.com/naptha/tesseract.js           |
| tesseract.js-core      | 5.1.1   | Apache-2.0              | antimatter15                                                            | https://github.com/naptha/tesseract.js-core      |
| webextension-polyfill  | 0.12.0  | MPL-2.0                 | Mozilla                                                                 | https://github.com/mozilla/webextension-polyfill |

> Notes:
>
> - **speech-rule-engine** (Apache-2.0, (c) Volker Sorge) powers AssisT's spoken-mathematics feature.
> - **dompurify** is offered as `MPL-2.0 OR Apache-2.0` (AssisT relies on the Apache-2.0 option).
>   **webextension-polyfill** is MPL-2.0.
> - **tesseract.js-core** is the Tesseract OCR engine compiled to WebAssembly; the `.wasm.js` core
>   files it ships are included in the package. **@tesseract.js-data/eng** is the English language
>   model for that engine and the only OCR language model in the package (other languages are
>   downloaded on request, see ADR 0008).
> - The full text of MPL-2.0 ships in each package's `LICENSE` file and at the SPDX index
>   (https://spdx.org/licenses/).

## Fonts

Shipped in `src/assets/fonts/`. The licence named for each is the one embedded in the font files
themselves. The SIL Open Font License 1.1 is at https://openfontlicense.org/open-font-license-official-text/.

| Font                  | Files | Licence (from the font's own metadata)                                                                                                             | Copyright                                         |
| --------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Andika                | 20    | SIL Open Font License 1.1 (http://scripts.sil.org/OFL)                                                                                             | (c) 2004-2022 SIL International                   |
| Atkinson Hyperlegible | 8     | SIL Open Font License 1.1 (https://scripts.sil.org/OFL)                                                                                            | (c) 2020 Braille Institute of America, Inc.       |
| Comic Neue            | 6     | SIL Open Font License 1.1 (https://scripts.sil.org/OFL)                                                                                            | (c) 2014 The Comic Neue Project Authors           |
| Lexend                | 3     | SIL Open Font License 1.1 (https://scripts.sil.org/OFL)                                                                                            | (c) 2019 The Lexend Project Authors               |
| OpenDyslexic          | 2     | Bitstream licence for the original glyphs (http://opendyslexic.org/legal/); Creative Commons Attribution 3.0 Unported for the OpenDyslexic changes | (c) Bitstream; changes (c) 2012 Abelardo Gonzalez |

## WebLLM model libraries

The Browser AI models need a compiled WebGPU library per model. The build downloads them from
[mlc-ai/binary-mlc-llm-libs](https://github.com/mlc-ai/binary-mlc-llm-libs) at a pinned commit,
checks each against a SHA-256 in `src/ai/webllm-model-libs.js`, and includes them in the package
(ADR 0010). That repository states no licence of its own. The libraries are compiled output of
[MLC LLM](https://github.com/mlc-ai/mlc-llm), which is Apache-2.0. The model weights are not in
the package; they are downloaded from Hugging Face on request and carry the licence of each model.

## Development tools, not shipped

These are `devDependencies` used by scripts in `scripts/` or the test suite and are not part of the
built extension. For example, `citeproc` (CPAL-1.0 OR AGPL-1.0, https://github.com/juris-m/citeproc-js)
is used only by `scripts/csl-crosscheck.mjs` to compare citation output against the reference
processor.

---

## NOTICE (Apache-2.0 section 4d) - Dexie.js

```
Dexie.js

Copyright (c) 2014-2017 David Fahlander

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```

---

## Apache License 2.0

Applies to: @mlc-ai/web-llm, @mozilla/readability, dexie, dompurify (Apache option), pdfjs-dist,
speech-rule-engine, tesseract.js, tesseract.js-core.

```
Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but
      not limited to compiled object code, generated documentation,
      and conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or
      Object form, made available under the License, as indicated by a
      copyright notice that is included in or attached to the work
      (an example is provided in the Appendix below).

      "Derivative Works" shall mean any work, whether in Source or Object
      form, that is based on (or derived from) the Work and for which the
      editorial revisions, annotations, elaborations, or other modifications
      represent, as a whole, an original work of authorship. For the purposes
      of this License, Derivative Works shall not include works that remain
      separable from, or merely link (or bind by name) to the interfaces of,
      the Work and Derivative Works thereof.

      "Contribution" shall mean any work of authorship, including
      the original version of the Work and any modifications or additions
      to that Work or Derivative Works thereof, that is intentionally
      submitted to Licensor for inclusion in the Work by the copyright owner
      or by an individual or Legal Entity authorized to submit on behalf of
      the copyright owner. For the purposes of this definition, "submitted"
      means any form of electronic, verbal, or written communication sent
      to the Licensor or its representatives, including but not limited to
      communication on electronic mailing lists, source code control systems,
      and issue tracking systems that are managed by, or on behalf of, the
      Licensor for the purpose of discussing and improving the Work, but
      excluding communication that is conspicuously marked or otherwise
      designated in writing by the copyright owner as "Not a Contribution."

      "Contributor" shall mean Licensor and any individual or Legal Entity
      on behalf of whom a Contribution has been received by Licensor and
      subsequently incorporated within the Work.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      (except as stated in this section) patent license to make, have made,
      use, offer to sell, sell, import, and otherwise transfer the Work,
      where such license applies only to those patent claims licensable
      by such Contributor that are necessarily infringed by their
      Contribution(s) alone or by combination of their Contribution(s)
      with the Work to which such Contribution(s) was submitted. If You
      institute patent litigation against any entity (including a
      cross-claim or counterclaim in a lawsuit) alleging that the Work
      or a Contribution incorporated within the Work constitutes direct
      or contributory patent infringement, then any patent licenses
      granted to You under this License for that Work shall terminate
      as of the date such litigation is filed.

   4. Redistribution. You may reproduce and distribute copies of the
      Work or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You
      meet the following conditions:

      (a) You must give any other recipients of the Work or
          Derivative Works a copy of this License; and

      (b) You must cause any modified files to carry prominent notices
          stating that You changed the files; and

      (c) You must retain, in the Source form of any Derivative Works
          that You distribute, all copyright, patent, trademark, and
          attribution notices from the Source form of the Work,
          excluding those notices that do not pertain to any part of
          the Derivative Works; and

      (d) If the Work includes a "NOTICE" text file as part of its
          distribution, then any Derivative Works that You distribute must
          include a readable copy of the attribution notices contained
          within such NOTICE file, excluding those notices that do not
          pertain to any part of the Derivative Works, in at least one
          of the following places: within a NOTICE text file distributed
          as part of the Derivative Works; within the Source form or
          documentation, if provided along with the Derivative Works; or,
          within a display generated by the Derivative Works, if and
          wherever such third-party notices normally appear. The contents
          of the NOTICE file are for informational purposes only and
          do not modify the License. You may add Your own attribution
          notices within Derivative Works that You distribute, alongside
          or as an addendum to the NOTICE text from the Work, provided
          that such additional attribution notices cannot be construed
          as modifying the License.

      You may add Your own copyright statement to Your modifications and
      may provide additional or different license terms and conditions
      for use, reproduction, or distribution of Your modifications, or
      for any such Derivative Works as a whole, provided Your use,
      reproduction, and distribution of the Work otherwise complies with
      the conditions stated in this License.

   5. Submission of Contributions. Unless You explicitly state otherwise,
      any Contribution intentionally submitted for inclusion in the Work
      by You to the Licensor shall be under the terms and conditions of
      this License, without any additional terms or conditions.
      Notwithstanding the above, nothing herein shall supersede or modify
      the terms of any separate license agreement you may have executed
      with Licensor regarding such Contributions.

   6. Trademarks. This License does not grant permission to use the trade
      names, trademarks, service marks, or product names of the Licensor,
      except as required for reasonable and customary use in describing the
      origin of the Work and reproducing the content of the NOTICE file.

   7. Disclaimer of Warranty. Unless required by applicable law or
      agreed to in writing, Licensor provides the Work (and each
      Contributor provides its Contributions) on an "AS IS" BASIS,
      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
      implied, including, without limitation, any warranties or conditions
      of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
      PARTICULAR PURPOSE. You are solely responsible for determining the
      appropriateness of using or redistributing the Work and assume any
      risks associated with Your exercise of permissions under this License.

   8. Limitation of Liability. In no event and under no legal theory,
      whether in tort (including negligence), contract, or otherwise,
      unless required by applicable law (such as deliberate and grossly
      negligent acts) or agreed to in writing, shall any Contributor be
      liable to You for damages, including any direct, indirect, special,
      incidental, or consequential damages of any character arising as a
      result of this License or out of the use or inability to use the
      Work (including but not limited to damages for loss of goodwill,
      work stoppage, computer failure or malfunction, or any and all
      other commercial damages or losses), even if such Contributor
      has been advised of the possibility of such damages.

   9. Accepting Warranty or Additional Liability. While redistributing
      the Work or Derivative Works thereof, You may choose to offer,
      and charge a fee for, acceptance of support, warranty, indemnity,
      or other liability obligations and/or rights consistent with this
      License. However, in accepting such obligations, You may act only
      on Your own behalf and on Your sole responsibility, not on behalf
      of any other Contributor, and only if You agree to indemnify,
      defend, and hold each Contributor harmless for any liability
      incurred by, or claims asserted against, such Contributor by reason
      of your accepting any such warranty or additional liability.

   END OF TERMS AND CONDITIONS
```

---

## MIT License

Applies to: @tesseract.js-data/eng, compromise, crypto-js, open-graph-scraper, sortablejs. Copyright holders are the
respective authors listed in the table above.

```
Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
associated documentation files (the "Software"), to deal in the Software without restriction,
including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense,
and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial
portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT
LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

---

## ISC License

Applies to: d3-drag, d3-force, d3-selection, d3-zoom. Copyright (c) Mike Bostock.

```
Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee
is hereby granted, provided that the above copyright notice and this permission notice appear in all
copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE
INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE
LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING
FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS
ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
```
