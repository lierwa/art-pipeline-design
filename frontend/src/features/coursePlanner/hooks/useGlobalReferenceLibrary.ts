import { useCallback, useEffect, useState } from "react";

import {
  createCharacterIp,
  createSceneStyleReference,
  deleteCharacterIp,
  deleteSceneStyleReference,
  listCharacterIps,
  listSceneStyleReferences,
  updateCharacterIp,
  updateSceneStyleReference,
  type GlobalLibraryCreateInput,
  type GlobalLibraryUpdateInput,
} from "../api";
import type { CharacterIpProfile, SceneStyleReference } from "../types";

export function useGlobalReferenceLibrary(isOpen: boolean) {
  const [characterIps, setCharacterIps] = useState<CharacterIpProfile[]>([]);
  const [sceneStyles, setSceneStyles] = useState<SceneStyleReference[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [characters, styles] = await Promise.all([
        listCharacterIps(),
        listSceneStyleReferences(),
      ]);
      setCharacterIps(characters);
      setSceneStyles(styles);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      void refresh();
    }
  }, [isOpen, refresh]);

  const mutate = useCallback(async <T,>(operation: () => Promise<T>): Promise<T | null> => {
    setIsMutating(true);
    setError(null);
    try {
      return await operation();
    } catch (caught) {
      setError(errorMessage(caught));
      return null;
    } finally {
      setIsMutating(false);
    }
  }, []);

  const saveCharacter = useCallback(async (
    id: string | null,
    input: GlobalLibraryCreateInput | GlobalLibraryUpdateInput,
  ) => {
    const item = await mutate(() => id
      ? updateCharacterIp(id, input)
      : createCharacterIp(input as GlobalLibraryCreateInput));
    if (item) {
      setCharacterIps((current) => upsertById(current, item));
    }
    return item;
  }, [mutate]);

  const saveStyle = useCallback(async (
    id: string | null,
    input: GlobalLibraryCreateInput | GlobalLibraryUpdateInput,
  ) => {
    const item = await mutate(() => id
      ? updateSceneStyleReference(id, input)
      : createSceneStyleReference(input as GlobalLibraryCreateInput));
    if (item) {
      setSceneStyles((current) => upsertById(current, item));
    }
    return item;
  }, [mutate]);

  const removeCharacter = useCallback(async (id: string) => {
    const removed = await mutate(async () => {
      await deleteCharacterIp(id);
      return true;
    });
    if (removed) {
      setCharacterIps((current) => current.filter((item) => item.id !== id));
    }
    return Boolean(removed);
  }, [mutate]);

  const removeStyle = useCallback(async (id: string) => {
    const removed = await mutate(async () => {
      await deleteSceneStyleReference(id);
      return true;
    });
    if (removed) {
      setSceneStyles((current) => current.filter((item) => item.id !== id));
    }
    return Boolean(removed);
  }, [mutate]);

  return {
    characterIps,
    sceneStyles,
    isLoading,
    isMutating,
    error,
    clearError: () => setError(null),
    refresh,
    saveCharacter,
    saveStyle,
    removeCharacter,
    removeStyle,
  };
}

function upsertById<T extends { id: string }>(items: T[], next: T): T[] {
  const exists = items.some((item) => item.id === next.id);
  return exists
    ? items.map((item) => item.id === next.id ? next : item)
    : [...items, next];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "资料库操作失败。";
}
