// Web Worker that runs the (potentially long) exhaustive packing search off the main thread, so the
// UI stays responsive and can show a live progress bar + ETA. The main thread (App.vue) posts a
// run request; this worker streams progress and finally the packed trucks back.
//
// Message protocol:
//   in:  { runId, items, truckSizes, budgetMs }
//   out: { type: 'progress', runId, fraction, etaMs }
//        { type: 'done',     runId, trucks }
//        { type: 'error',    runId, message }
//
// `items` and `truckSizes` are plain, structured-clone-safe objects (shapes are arrays of [x,y,z]).
import { planAndPack } from './packing.js';

self.onmessage = (event) => {
  const { runId, items, truckSizes, budgetMs } = event.data || {};
  try {
    const { trucks } = planAndPack(items, {
      truckSizes,
      budgetMs,
      onProgress: ({ fraction, etaMs }) => {
        self.postMessage({ type: 'progress', runId, fraction, etaMs });
      },
    });
    self.postMessage({ type: 'done', runId, trucks });
  } catch (err) {
    self.postMessage({ type: 'error', runId, message: err && err.message ? err.message : String(err) });
  }
};
