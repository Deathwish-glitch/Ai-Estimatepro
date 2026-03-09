import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getProjectsApi, saveProjectApi } from "@/services/api";

const BuildCalcContext = createContext(null);

const ESTIMATE_STORAGE_KEY = "buildcalc-latest-estimate";
const INPUT_STORAGE_KEY = "buildcalc-latest-input";

const parseStoredData = (key) => {
  const value = localStorage.getItem(key);
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

export const BuildCalcProvider = ({ children }) => {
  const [latestEstimate, setLatestEstimate] = useState(() => parseStoredData(ESTIMATE_STORAGE_KEY));
  const [latestInput, setLatestInput] = useState(() => parseStoredData(INPUT_STORAGE_KEY));
  const [savedProjects, setSavedProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(false);

  useEffect(() => {
    if (latestEstimate) {
      localStorage.setItem(ESTIMATE_STORAGE_KEY, JSON.stringify(latestEstimate));
    }
  }, [latestEstimate]);

  useEffect(() => {
    if (latestInput) {
      localStorage.setItem(INPUT_STORAGE_KEY, JSON.stringify(latestInput));
    }
  }, [latestInput]);

  const refreshProjects = async () => {
    setLoadingProjects(true);
    try {
      const response = await getProjectsApi();
      setSavedProjects(response.data || []);
    } catch {
      setSavedProjects([]);
    } finally {
      setLoadingProjects(false);
    }
  };

  useEffect(() => {
    refreshProjects();
  }, []);

  const applyEstimate = (inputData, resultData) => {
    setLatestInput(inputData);
    setLatestEstimate(resultData);
  };

  const saveProject = async (projectName, inputData) => {
    const payloadInput = inputData || latestInput;
    const response = await saveProjectApi({
      project_name: projectName,
      input_data: payloadInput,
    });

    setSavedProjects((previous) => [
      response.data,
      ...previous.filter((item) => item.id !== response.data.id),
    ]);
    setLatestInput(response.data.input_data);
    setLatestEstimate(response.data.result);
    return response.data;
  };

  const loadSavedProject = (project) => {
    setLatestInput(project.input_data);
    setLatestEstimate(project.result);
  };

  const value = useMemo(
    () => ({
      latestEstimate,
      latestInput,
      savedProjects,
      loadingProjects,
      applyEstimate,
      saveProject,
      loadSavedProject,
      refreshProjects,
    }),
    [latestEstimate, latestInput, savedProjects, loadingProjects],
  );

  return <BuildCalcContext.Provider value={value}>{children}</BuildCalcContext.Provider>;
};

export const useBuildCalc = () => {
  const context = useContext(BuildCalcContext);
  if (!context) {
    throw new Error("useBuildCalc must be used inside BuildCalcProvider");
  }
  return context;
};