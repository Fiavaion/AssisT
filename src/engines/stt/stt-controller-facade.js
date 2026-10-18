/**
 * STT Controller Facade
 *
 * This facade provides a stable import point for the STT controller.
 * Currently delegates to stt-controller.js (Web Speech API implementation).
 *
 * The facade is the single import point, so a different controller can be swapped in behind it
 * without touching any consumer.
 *
 * All content scripts and features MUST import from this facade, not the concrete files.
 *
 * @module engines/stt/stt-controller-facade
 */

export { STTController, STTController as default } from './stt-controller.js';
