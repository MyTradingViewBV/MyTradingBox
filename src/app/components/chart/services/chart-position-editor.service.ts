import { Injectable } from '@angular/core';
import { Drawing } from './drawing-tools.service';

export interface PositionEditorState {
  selectedPositionId: string | null;
  editEntry: number | null;
  editTP: number | null;
  editSL: number | null;
  editMode: 'price' | 'pct';
  editTPPct: number | null;
  editSLPct: number | null;
}

@Injectable({ providedIn: 'root' })
export class ChartPositionEditorService {
  getSelectedPositionDrawing(drawings: Drawing[], selectedPositionId: string | null): Drawing | null {
    if (!selectedPositionId) return null;
    return (
      drawings.find(
        (d) =>
          d.id === selectedPositionId &&
          (d.type === 'long-position' || d.type === 'short-position'),
      ) ?? null
    );
  }

  selectPositionDrawing(drawing: Drawing): PositionEditorState {
    return {
      selectedPositionId: drawing.id,
      editEntry: drawing.points[0]?.y ?? null,
      editTP: drawing.points[1]?.y ?? null,
      editSL: drawing.points[2]?.y ?? null,
      editMode: 'price',
      editTPPct: null,
      editSLPct: null,
    };
  }

  syncFromDrawing(state: PositionEditorState, drawing: Drawing): Partial<PositionEditorState> {
    if (state.selectedPositionId !== drawing.id) return {};

    const editEntry = drawing.points[0]?.y ?? null;
    const editTP = drawing.points[1]?.y ?? null;
    const editSL = drawing.points[2]?.y ?? null;

    let editTPPct = state.editTPPct;
    let editSLPct = state.editSLPct;

    if (state.editMode === 'pct' && editEntry && editTP != null && editSL != null) {
      editTPPct = +(((editTP - editEntry) / editEntry) * 100).toFixed(3);
      editSLPct = +(((editEntry - editSL) / editEntry) * 100).toFixed(3);
    }

    return { editEntry, editTP, editSL, editTPPct, editSLPct };
  }

  setEditMode(state: PositionEditorState, mode: 'price' | 'pct'): Partial<PositionEditorState> {
    if (mode === state.editMode) return {};

    let editTP = state.editTP;
    let editSL = state.editSL;
    let editTPPct = state.editTPPct;
    let editSLPct = state.editSLPct;

    if (mode === 'pct' && state.editEntry && state.editTP != null && state.editSL != null) {
      editTPPct = +(((state.editTP - state.editEntry) / state.editEntry) * 100).toFixed(3);
      editSLPct = +(((state.editEntry - state.editSL) / state.editEntry) * 100).toFixed(3);
    } else if (mode === 'price' && state.editEntry && state.editTPPct != null && state.editSLPct != null) {
      editTP = +(state.editEntry * (1 + state.editTPPct / 100)).toFixed(2);
      editSL = +(state.editEntry * (1 - state.editSLPct / 100)).toFixed(2);
    }

    return { editMode: mode, editTP, editSL, editTPPct, editSLPct };
  }

  toPriceValues(state: PositionEditorState): Partial<PositionEditorState> {
    if (
      state.editMode === 'pct' &&
      state.editEntry != null &&
      state.editTPPct != null &&
      state.editSLPct != null
    ) {
      return {
        editTP: +(state.editEntry * (1 + state.editTPPct / 100)).toFixed(2),
        editSL: +(state.editEntry * (1 - state.editSLPct / 100)).toFixed(2),
      };
    }
    return {};
  }

  flipPosition(state: PositionEditorState): Partial<PositionEditorState> {
    if (state.editTP == null || state.editSL == null || state.editEntry == null) {
      return {};
    }
    const distTP = state.editTP - state.editEntry;
    const distSL = state.editSL - state.editEntry;
    return {
      editTP: state.editEntry - distTP,
      editSL: state.editEntry - distSL,
    };
  }

  getProfitPercent(state: PositionEditorState): number | null {
    if (!state.editEntry || state.editTP == null) return null;
    return +(((state.editTP - state.editEntry) / state.editEntry) * 100).toFixed(2);
  }

  getLossPercent(state: PositionEditorState): number | null {
    if (!state.editEntry || state.editSL == null) return null;
    return +(((state.editEntry - state.editSL) / state.editEntry) * 100).toFixed(2);
  }

  getPositionType(drawing: Drawing | null): string {
    if (!drawing) return '';
    return drawing.type === 'short-position' ? 'Short' : 'Long';
  }
}
