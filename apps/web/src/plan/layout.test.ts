import { describe, expect, it } from 'vitest';
import { CONVEYOR_LINE, MACHINES } from '@factory-twin/shared';
import { boardSize, planShape, planShapes, toBoard } from './layout';

const machine = (id: string) => MACHINES.find((m) => m.id === id)!;

describe('board', () => {
    it('swaps width and height in portrait', () => {
        const l = boardSize('landscape');
        const p = boardSize('portrait');
        expect(l.width).toBeGreaterThan(l.height);
        expect(p).toEqual({ width: l.height, height: l.width });
    });

    it('runs the line left to right in landscape and top to bottom in portrait', () => {
        const start = toBoard(CONVEYOR_LINE.startX, 0, 'landscape');
        const end = toBoard(CONVEYOR_LINE.endX, 0, 'landscape');
        expect(end.u).toBeGreaterThan(start.u);
        expect(end.v).toBe(start.v);

        const pStart = toBoard(CONVEYOR_LINE.startX, 0, 'portrait');
        const pEnd = toBoard(CONVEYOR_LINE.endX, 0, 'portrait');
        expect(pEnd.v).toBeGreaterThan(pStart.v);
        expect(pEnd.u).toBe(pStart.u);
    });
});

describe('planShape', () => {
    it('draws the conveyor as one belt along the whole line', () => {
        const belt = planShape(machine('CNV-01'), 'landscape');
        expect(belt.w).toBeCloseTo(CONVEYOR_LINE.endX - CONVEYOR_LINE.startX);
        expect(belt.rotation === 0).toBe(true);
    });

    it('turns shapes a quarter in portrait', () => {
        expect(planShape(machine('CNC-01'), 'portrait').rotation).toBe(90);
    });

    it('draws robots and the hopper round, the rest square', () => {
        expect(planShape(machine('RBT-01'), 'landscape').round).toBe(true);
        expect(planShape(machine('HPR-01'), 'landscape').round).toBe(true);
        expect(planShape(machine('PRS-01'), 'landscape').round).toBe(false);
    });

    it('puts every label just above its shape, and every shape on the board', () => {
        for (const orientation of ['landscape', 'portrait'] as const) {
            const { width, height } = boardSize(orientation);
            for (const s of planShapes(MACHINES, orientation)) {
                expect(s.labelV).toBeLessThan(s.v);
                expect(s.u).toBeGreaterThan(0);
                expect(s.u).toBeLessThan(width);
                expect(s.v).toBeGreaterThan(0);
                expect(s.v).toBeLessThan(height);
            }
        }
    });
});