/**
 * STT Controller Facade
 *
 * This facade provides a stable import point for the STT controller.
 * Currently delegates to stt-controller.js (Web Speech API implementation).
 *
 * Architecture note:
 * - stt-controller.js (v2.1.0)          - Current production: Web Speech API only
 * - stt-controller-enhanced.js (v3.0.0) - Future: Multi-engine (Whisper, Azure, Web Speech)
 *
 * When multi-engine support is ready, swap the import below to stt-controller-enhanced.js
 * without touching any consumers of this facade.
 *
 * All content scripts and features MUST import from this facade, not the concrete files.
 *
 * @module engines/stt/stt-controller-facade
 */

export { STTController, STTController as default } from './stt-controller.js';
