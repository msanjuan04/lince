// Trigger manual del Pulse dispatch sin esperar al cron.
//
// Uso:
//   pnpm --filter @lince/scheduler trigger-pulse

import { runPulseDispatch } from './jobs/pulse-dispatch';

async function main(): Promise<void> {
  console.log('=== Trigger manual del Pulse dispatch ===\n');
  const result = await runPulseDispatch();
  console.log('\n=== Resultado ===');
  console.log(`  Status:     ${result.status}`);
  console.log(`  Recipients: ${result.recipients}`);
  console.log(`  Sent:       ${result.sent}`);
  console.log(`  Failed:     ${result.failed}`);
  console.log(`  Cost est.:  ${result.estimatedCostEur}€`);
  console.log(`  Duration:   ${result.durationMs}ms`);
  console.log(`  Run ID:     ${result.runId}`);
  if (result.status !== 'ok') process.exit(1);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
