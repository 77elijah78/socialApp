import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { MessageRow } from "../db/schema";
import { mediaService } from "../services/MediaService";
import { showAppDialog } from "../services/AppDialogService";
import { useOverlay } from "../providers/OverlayProvider";
import { copyToClipboard } from "../utils/deepLinks";
import {
  batchFailureText,
  canReplyToMessage,
  copyableMessageText,
  deletionRestriction,
  runMessageBatch,
} from "../utils/messaging/actions";

/** Interaction state only. Canonical rows/identity/deletion still belong to the
 * existing SQLite MessageStore; no second message or socket store. */
export function useMessageSelection(messages: MessageRow[], userId: string) {
  const [ids, setIds] = useState<ReadonlySet<string>>(() => new Set());
  const idsRef = useRef(ids);
  const rows = useRef(messages);
  const alive = useRef(true);
  const generation = useRef(mediaService.message.sessionVersion);
  const isCurrent = useCallback(
    () =>
      alive.current &&
      generation.current === mediaService.message.sessionVersion,
    [],
  );
  const busyRef = useRef(false);
  const forwardRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [forwardOpen, setForwardOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [forwardError, setForwardError] = useState<string | null>(null);
  const { openActionMenu } = useOverlay();
  useLayoutEffect(() => {
    rows.current = messages;
  }, [messages]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const replace = useCallback((next: ReadonlySet<string>) => {
    idsRef.current = next;
    if (alive.current) {
      setIds(next);
      if (!next.size) {
        forwardRef.current = false;
        setForwardOpen(false);
      }
    }
  }, []);
  const selectedRows = useMemo(
    () => (ids.size ? messages.filter((row) => ids.has(row.localId)) : []),
    [messages, ids],
  );
  // Render-time adjustment is conditional on a changed canonical selection;
  // React retries before commit instead of painting stale counts then pruning
  // in an effect. The explicit batch result owns pruning while busy.
  if (!busy && selectedRows.length !== ids.size) {
    setIds(new Set(selectedRows.map((row) => row.localId)));
    if (!selectedRows.length && forwardOpen) setForwardOpen(false);
  }
  useLayoutEffect(() => {
    idsRef.current = ids;
    forwardRef.current = forwardOpen;
  }, [ids, forwardOpen]);
  const toggle = useCallback(
    (row: MessageRow) => {
      if (busyRef.current || row.deletedAt) return;
      const next = new Set(idsRef.current);
      if (next.has(row.localId)) next.delete(row.localId);
      else next.add(row.localId);
      replace(next);
      setNotice(null);
    },
    [replace],
  );
  const cancel = useCallback(() => {
    if (busyRef.current) return false;
    forwardRef.current = false;
    setForwardOpen(false);
    setForwardError(null);
    setNotice(null);
    replace(new Set());
    return true;
  }, [replace]);
  const closeForward = useCallback(() => {
    if (busyRef.current) return;
    forwardRef.current = false;
    setForwardOpen(false);
  }, []);
  const handleBack = useCallback(() => {
    if (busyRef.current) return true;
    if (forwardRef.current) {
      closeForward();
      return true;
    }
    if (idsRef.current.size) {
      cancel();
      return true;
    }
    return false;
  }, [cancel, closeForward]);
  const snapshot = useCallback(
    () => rows.current.filter((row) => idsRef.current.has(row.localId)),
    [],
  );
  const keepFailures = useCallback(
    (failed: { row: MessageRow }[]) => {
      replace(new Set(failed.map(({ row }) => row.localId)));
    },
    [replace],
  );
  const begin = useCallback(() => {
    if (!isCurrent() || busyRef.current || !idsRef.current.size) return false;
    busyRef.current = true;
    setBusy(true);
    setNotice(null);
    return true;
  }, [isCurrent]);
  const finish = useCallback(() => {
    busyRef.current = false;
    if (alive.current) setBusy(false);
  }, []);

  const remove = useCallback(
    async (mode: "me" | "everyone", chosen: MessageRow[]) => {
      if (!begin()) return;
      try {
        const result = await runMessageBatch(
          chosen,
          async (row) => {
            const restriction = deletionRestriction(row, userId, mode);
            if (restriction) throw new Error(restriction);
            await mediaService.message.delete(row.id ?? row.localId, mode);
          },
          isCurrent,
        );
        if (!isCurrent()) return;
        keepFailures(result.failed);
        if (result.failed.length)
          setNotice(batchFailureText(result, "deleted"));
      } finally {
        finish();
      }
    },
    [begin, finish, keepFailures, userId, isCurrent],
  );
  const confirmDelete = useCallback(
    (mode: "me" | "everyone") => {
      const chosen = snapshot();
      const permitted = chosen.filter(
        (row) => !deletionRestriction(row, userId, mode),
      ).length;
      if (!chosen.length || !permitted || busyRef.current) return;
      showAppDialog({
        title: `Delete ${permitted} ${permitted === 1 ? "message" : "messages"} for ${mode}?`,
        tone: "warning",
        message: [
          mode === "everyone"
            ? "This cannot be undone for other participants."
            : "Confirmed deletions stay hidden on this device. The current server does not retain per-user deletion history, so clearing app data can restore them.",
          chosen.length > permitted
            ? `${chosen.length - permitted} ineligible messages will stay selected.`
            : "",
          mode === "me" && chosen.some((row) => row.senderId !== userId)
            ? "The current server may reject received messages; any rejection will stay selected with its error."
            : "",
        ]
          .filter(Boolean)
          .join(" "),
        buttons: [
          { key: "cancel", label: "Cancel", cancel: true },
          {
            key: "delete",
            label: "Delete",
            destructive: true,
            onPress: () => {
              void remove(mode, chosen);
            },
          },
        ],
      });
    },
    [snapshot, userId, remove],
  );
  const requestDelete = useCallback(() => {
    if (busyRef.current) return;
    const chosen = snapshot();
    const me = chosen.filter(
      (row) => !deletionRestriction(row, userId, "me"),
    ).length;
    const everyone = chosen.filter(
      (row) => !deletionRestriction(row, userId, "everyone"),
    ).length;
    openActionMenu([
      ...(me
        ? [
            {
              key: "me",
              icon: "person-outline" as const,
              label: "Delete for me",
              onPress: () => confirmDelete("me"),
            },
          ]
        : []),
      ...(everyone
        ? [
            {
              key: "everyone",
              icon: "people-outline" as const,
              label: `Delete for everyone (${everyone} of ${chosen.length})`,
              destructive: true,
              onPress: () => confirmDelete("everyone"),
            },
          ]
        : []),
    ]);
  }, [snapshot, userId, openActionMenu, confirmDelete]);
  const copy = useCallback(async () => {
    const chosen = snapshot().flatMap((row) => {
      const text = copyableMessageText(row);
      return text ? [{ row, text }] : [];
    });
    if (!chosen.length || !begin()) return;
    try {
      await copyToClipboard(chosen.map((item) => item.text).join("\n\n"));
      if (!isCurrent()) return;
      const copied = new Set(chosen.map((item) => item.row.localId));
      replace(new Set([...idsRef.current].filter((id) => !copied.has(id))));
      if (idsRef.current.size)
        setNotice(
          "Text copied. Attachments without copyable text remain selected.",
        );
    } catch (error) {
      if (isCurrent())
        setNotice(
          error instanceof Error
            ? error.message
            : "Couldn’t copy. Your selection has been kept.",
        );
    } finally {
      finish();
    }
  }, [snapshot, begin, finish, replace, isCurrent]);
  const openForward = useCallback(() => {
    if (
      busyRef.current ||
      !snapshot().every(canReplyToMessage) ||
      !idsRef.current.size
    )
      return;
    forwardRef.current = true;
    setForwardError(null);
    setForwardOpen(true);
  }, [snapshot]);
  const forward = useCallback(
    async (targetConversationId: string) => {
      const chosen = snapshot();
      if (!targetConversationId || !chosen.length || !begin()) return;
      setForwardError(null);
      try {
        // One at a time preserves the selected messages' canonical order in the
        // destination. The backend has only individual forward, not a bulk API.
        const result = await runMessageBatch(
          chosen,
          (row) =>
            mediaService.message.forward(
              row.id ?? row.localId,
              targetConversationId,
              userId,
            ),
          isCurrent,
          1,
        );
        if (!isCurrent()) return;
        keepFailures(result.failed);
        if (result.failed.length)
          setForwardError(batchFailureText(result, "forwarded"));
        else {
          forwardRef.current = false;
          setForwardOpen(false);
        }
      } finally {
        finish();
      }
    },
    [snapshot, begin, finish, keepFailures, userId, isCurrent],
  );
  const dismissNotice = useCallback(() => setNotice(null), []);
  return {
    ids,
    idsRef,
    busyRef,
    busy,
    active: ids.size > 0,
    selectedRows,
    toggle,
    cancel,
    handleBack,
    requestDelete,
    copy,
    notice,
    dismissNotice,
    forwardOpen,
    forwardError,
    openForward,
    closeForward,
    forward,
    canCopy: selectedRows.some((row) => Boolean(copyableMessageText(row))),
    canDelete: selectedRows.some(
      (row) => !deletionRestriction(row, userId, "me"),
    ),
    canForward:
      selectedRows.length > 0 && selectedRows.every(canReplyToMessage),
    replyTarget:
      selectedRows.length === 1 && canReplyToMessage(selectedRows[0])
        ? selectedRows[0]
        : null,
    retryTarget:
      selectedRows.length === 1 &&
      selectedRows[0].senderId === userId &&
      selectedRows[0].status === "FAILED"
        ? selectedRows[0]
        : null,
  };
}
