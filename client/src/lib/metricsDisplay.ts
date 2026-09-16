import type { CrowdsecMetricsBouncerMode } from '../types';

/**
 * Maps a bouncer's decision-API mode to the Badge variant used to display
 * it. Shared between the Metrics page and the Security Engine details page
 * so both surfaces render the same mode the same way.
 */
export function bouncerModeVariant(mode: CrowdsecMetricsBouncerMode | undefined): 'success' | 'info' | 'warning' | 'secondary' {
  if (mode === 'live') return 'success';
  if (mode === 'stream') return 'info';
  if (mode === 'mixed') return 'warning';
  return 'secondary';
}
