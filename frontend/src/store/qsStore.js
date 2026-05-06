import { create } from "zustand";

const cloneRows = (rows) => rows.map((row) => ({ ...row }));

export const useQsStore = create((set, get) => ({
  project: {
    id: "",
    project_name: "",
    client_name: "",
    location: "Nashik",
    built_up_area: 0,
    floors: 1,
    construction_type: "RCC Frame",
    rate_profile: "Standard",
  },
  activeVersionId: "",
  versions: [],
  measurements: [],
  boqItems: [],
  materialRates: [],
  labourRates: [],
  city: "Nashik",
  undoStack: [],
  redoStack: [],

  setProject: (project) => set({ project }),
  setVersions: (versions) => set({ versions }),
  setActiveVersionId: (activeVersionId) => set({ activeVersionId }),
  setMaterialRates: (materialRates) => set({ materialRates }),
  setLabourRates: (labourRates) => set({ labourRates }),
  setCity: (city) => set({ city }),

  setMeasurements: (measurements) =>
    set((state) => ({
      measurements,
      undoStack: [...state.undoStack, cloneRows(state.measurements)].slice(-40),
      redoStack: [],
    })),

  setBoqItems: (boqItems) => set({ boqItems }),

  pushUndoSnapshot: () =>
    set((state) => ({
      undoStack: [...state.undoStack, cloneRows(state.measurements)].slice(-40),
      redoStack: [],
    })),

  undoMeasurements: () => {
    const { undoStack, measurements, redoStack } = get();
    if (!undoStack.length) return;
    const previous = undoStack[undoStack.length - 1];
    set({
      measurements: cloneRows(previous),
      undoStack: undoStack.slice(0, -1),
      redoStack: [...redoStack, cloneRows(measurements)].slice(-40),
    });
  },

  redoMeasurements: () => {
    const { redoStack, measurements, undoStack } = get();
    if (!redoStack.length) return;
    const nextRows = redoStack[redoStack.length - 1];
    set({
      measurements: cloneRows(nextRows),
      redoStack: redoStack.slice(0, -1),
      undoStack: [...undoStack, cloneRows(measurements)].slice(-40),
    });
  },
}));