import { describe, expect, it } from 'vitest';
import { parseOrsResponse, type OrsResponse } from './routing.js';

// Two legs: start → waypoint (a curiosity) → back to start.
const fixture: OrsResponse = {
  features: [
    {
      geometry: {
        type: 'LineString',
        coordinates: [
          [-0.1233, 51.5117],
          [-0.1247, 51.5121],
          [-0.126, 51.5125],
          [-0.1247, 51.5121],
          [-0.1233, 51.5117],
        ],
      },
      properties: {
        summary: { distance: 412.6 },
        segments: [
          {
            steps: [
              { distance: 0, instruction: 'Head west on King Street', name: 'King Street', type: 11, way_points: [0, 0] },
              { distance: 180.4, instruction: 'Turn right onto Garrick Street', name: 'Garrick Street', type: 1, way_points: [0, 1] },
              { distance: 26, instruction: 'Enter the roundabout and take the 2nd exit', name: '-', type: 7, exit_number: 2, way_points: [1, 2] },
              { distance: 0, instruction: 'Arrive at Garrick Street', name: '-', type: 10, way_points: [2, 2] },
            ],
          },
          {
            steps: [
              { distance: 0, instruction: 'Head east', name: '-', type: 11, way_points: [2, 2] },
              { distance: 206.2, instruction: 'Keep left onto King Street', name: 'King Street', type: 12, way_points: [2, 4] },
              { distance: 0, instruction: 'Arrive at King Street, on the left', name: '-', type: 10, way_points: [4, 4] },
            ],
          },
        ],
      },
    },
  ],
};

describe('parseOrsResponse', () => {
  const { steps, geometry, distanceM } = parseOrsResponse(fixture);

  it('keeps geometry and rounds distances', () => {
    expect(geometry.coordinates).toHaveLength(5);
    expect(distanceM).toBe(413);
    expect(steps.find((s) => s.type === 1)!.distanceM).toBe(180);
  });

  it('keeps the first (depart) step even at zero length', () => {
    expect(steps[0]!.type).toBe(11);
  });

  it('keeps only the final arrive step, pointing at the last vertex', () => {
    const arrivals = steps.filter((s) => s.type === 10);
    expect(arrivals).toHaveLength(1);
    expect(arrivals[0]!.startIndex).toBe(4);
    expect(steps.at(-1)!.type).toBe(10);
  });

  it('drops other zero-length steps', () => {
    expect(steps.filter((s) => s.type === 11)).toHaveLength(1);
  });

  it('keeps roundabout exits and maps "-" names to null', () => {
    const roundabout = steps.find((s) => s.type === 7)!;
    expect(roundabout.exitNumber).toBe(2);
    expect(roundabout.wayName).toBeNull();
    expect(steps.find((s) => s.type === 1)!.exitNumber).toBeUndefined();
  });

  it('rejects routes with fewer than two points', () => {
    const bad = structuredClone(fixture);
    bad.features[0]!.geometry.coordinates = [[0, 0]];
    expect(() => parseOrsResponse(bad)).toThrow();
  });
});
