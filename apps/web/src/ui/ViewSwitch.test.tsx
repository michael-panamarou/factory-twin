import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useTwinStore } from '../state/store';
import { ViewSwitch } from './ViewSwitch';

const initial = useTwinStore.getState();
beforeEach(() => useTwinStore.setState(initial, true));
afterEach(() => window.localStorage.clear());

describe('ViewSwitch', () => {
    it('switches views and remembers the choice', () => {
        useTwinStore.setState({ view: { mode: '3d', webgl: true, notice: null } });
        render(<ViewSwitch />);
        fireEvent.click(screen.getByRole('button', { name: '2D' }));
        expect(useTwinStore.getState().view.mode).toBe('2d');
        expect(window.localStorage.getItem('factory-twin:view')).toBe('2d');
        expect(screen.getByRole('button', { name: '2D' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('disables 3D when the browser has no WebGL', () => {
        useTwinStore.setState({ view: { mode: '2d', webgl: false, notice: null } });
        render(<ViewSwitch />);
        expect(screen.getByRole('button', { name: '3D' })).toBeDisabled();
        useTwinStore.getState().setView('3d');
        expect(useTwinStore.getState().view.mode).toBe('2d');
    });

    it('a 3D failure switches to 2D with a notice, without saving it as the choice', () => {
        useTwinStore.setState({ view: { mode: '3d', webgl: true, notice: null } });
        useTwinStore.getState().fallBackTo2D('Broken');
        expect(useTwinStore.getState().view).toMatchObject({ mode: '2d', notice: 'Broken' });
        expect(window.localStorage.getItem('factory-twin:view')).toBeNull();
        useTwinStore.getState().dismissViewNotice();
        expect(useTwinStore.getState().view.notice).toBeNull();
    });
});