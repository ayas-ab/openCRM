"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, MessageSquare, Send, AtSign } from "lucide-react";
import { toast } from "sonner";
import { createRecordComment } from "@/actions/standard/comment-actions";

export type RecordCommentItem = {
    id: number;
    recordId: number;
    authorId: number;
    authorName: string;
    authorUsername: string;
    bodyText: string;
    createdAt: string;
    editedAt: string | null;
};

interface RecordCommentPanelProps {
    recordId: number;
    comments: RecordCommentItem[];
    mentionCandidates: { id: number; name: string; username: string }[];
}

export function RecordCommentPanel({
    recordId,
    comments,
    mentionCandidates,
}: RecordCommentPanelProps) {
    const [bodyText, setBodyText] = useState("");
    const [items, setItems] = useState<RecordCommentItem[]>(comments);
    const [isPending, startTransition] = useTransition();
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const [mentionQuery, setMentionQuery] = useState<string | null>(null);
    const [mentionStart, setMentionStart] = useState<number | null>(null);

    useEffect(() => {
        setItems(comments);
    }, [comments]);

    const mentionUsernames = useMemo(
        () => new Set(mentionCandidates.map((user) => user.username.toLowerCase())),
        [mentionCandidates]
    );

    const updateMentionState = (value: string, cursor: number | null) => {
        const position = cursor ?? value.length;
        const beforeCursor = value.slice(0, position);
        const match = beforeCursor.match(/@([a-z0-9]*)$/i);
        if (!match) {
            setMentionQuery(null);
            setMentionStart(null);
            return;
        }
        setMentionQuery(match[1] ?? "");
        setMentionStart(position - (match[1]?.length ?? 0) - 1);
    };

    const handleSubmit = () => {
        if (!bodyText.trim()) {
            toast.error("Write a comment before posting.");
            return;
        }

        startTransition(async () => {
            const result = await createRecordComment({ recordId, bodyText });
            if (result.success && result.comment) {
                setItems((prev) => [result.comment as RecordCommentItem, ...prev]);
                setBodyText("");
                setMentionQuery(null);
                setMentionStart(null);
                toast.success("Comment posted.");
            } else {
                toast.error(result.error || "Failed to post comment.");
            }
        });
    };

    const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
        const value = event.target.value;
        setBodyText(value);
        updateMentionState(value, event.target.selectionStart);
    };

    const handleSelection = (event: React.SyntheticEvent<HTMLTextAreaElement>) => {
        const target = event.currentTarget;
        updateMentionState(target.value, target.selectionStart);
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
            event.preventDefault();
            handleSubmit();
        }
    };

    const handlePickMention = (username: string) => {
        if (mentionStart === null) return;
        const textarea = textareaRef.current;
        const cursor = textarea?.selectionStart ?? bodyText.length;
        const before = bodyText.slice(0, mentionStart);
        const after = bodyText.slice(cursor);
        const nextValue = `${before}@${username} ${after}`;
        setBodyText(nextValue);
        setMentionQuery(null);
        setMentionStart(null);
        requestAnimationFrame(() => {
            if (!textarea) return;
            const nextCursor = `${before}@${username} `.length;
            textarea.focus();
            textarea.setSelectionRange(nextCursor, nextCursor);
        });
    };

    const filteredMentions = useMemo(() => {
        if (mentionQuery === null) return [];
        const query = mentionQuery.toLowerCase();
        return mentionCandidates
            .filter((user) => user.username.toLowerCase().startsWith(query) || user.name.toLowerCase().includes(query))
            .slice(0, 6);
    }, [mentionQuery, mentionCandidates]);

    return (
        <Card className="flex max-h-[calc(100vh-120px)] flex-col overflow-hidden border-slate-200 shadow-sm">
            <CardHeader className="border-b bg-gradient-to-r from-slate-50 via-white to-slate-50 py-4">
                <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-800">
                    <MessageSquare className="h-4 w-4 text-slate-500" />
                    Comments & Chatter
                </CardTitle>
                <p className="text-xs text-slate-500">
                    Chat with teammates who can view this record.
                </p>
            </CardHeader>

            <div className="flex min-h-0 flex-1 flex-col">
                <CardContent className="flex min-h-0 flex-1 flex-col gap-4 p-4">
                    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
                        {items.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center text-sm text-slate-500">
                                No comments yet. Start the conversation.
                            </div>
                        ) : (
                            items.map((comment) => {
                                const initials = getInitials(comment.authorName);
                                return (
                                    <div key={comment.id} className="flex items-start gap-3">
                                        <div className="h-9 w-9 shrink-0 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-xs font-semibold">
                                            {initials}
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-semibold text-slate-900">{comment.authorName}</span>
                                                <span className="text-xs text-slate-400">@{comment.authorUsername}</span>
                                                <span className="ml-auto text-xs text-slate-400" suppressHydrationWarning>
                                                    {new Date(comment.createdAt).toLocaleString()}
                                                </span>
                                            </div>
                                            <div className="mt-2 rounded-2xl rounded-tl-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm">
                                                {renderCommentBody(comment.bodyText, mentionUsernames)}
                                            </div>
                                            {comment.editedAt && (
                                                <div className="mt-1 text-[11px] text-slate-400" suppressHydrationWarning>
                                                    Edited {new Date(comment.editedAt).toLocaleString()}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </CardContent>

                <div className="border-t bg-slate-50/80 p-4">
                    <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
                        <AtSign className="h-3.5 w-3.5" />
                        Type @username to mention someone.
                    </div>
                    <div className="relative">
                        <Textarea
                            ref={textareaRef}
                            placeholder="Write a message, update, or question..."
                            value={bodyText}
                            onChange={handleChange}
                            onSelect={handleSelection}
                            onKeyUp={handleSelection}
                            onKeyDown={handleKeyDown}
                            className="min-h-[88px] max-h-36 resize-none bg-white"
                        />
                        {mentionQuery !== null && filteredMentions.length > 0 && (
                            <div className="absolute bottom-full mb-2 w-full rounded-md border border-slate-200 bg-white shadow-lg">
                                <div className="px-3 py-2 text-xs text-slate-400 border-b border-slate-100">Mentions</div>
                                <div className="max-h-48 overflow-y-auto">
                                    {filteredMentions.map((user) => (
                                        <button
                                            key={user.id}
                                            type="button"
                                            onClick={() => handlePickMention(user.username)}
                                            className="flex w-full items-center justify-between px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                                        >
                                            <span className="font-medium">{user.name}</span>
                                            <span className="text-xs text-slate-400">@{user.username}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                        <span className="text-xs text-slate-400">
                            {bodyText.length}/5000
                        </span>
                        <Button onClick={handleSubmit} disabled={isPending} className="gap-2">
                            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                            Send
                        </Button>
                    </div>
                </div>
            </div>
        </Card>
    );
}

function renderCommentBody(bodyText: string, mentionUsernames: Set<string>) {
    const segments: ReactNode[] = [];
    let lastIndex = 0;
    const regex = /@([a-z0-9]+)/gi;

    for (const match of bodyText.matchAll(regex)) {
        const index = match.index ?? 0;
        if (index > lastIndex) {
            segments.push(bodyText.slice(lastIndex, index));
        }
        const username = match[1].toLowerCase();
        const mentionText = match[0];
        if (mentionUsernames.has(username)) {
            segments.push(
                <span key={`${mentionText}-${index}`} className="text-indigo-600 font-semibold">
                    {mentionText}
                </span>
            );
        } else {
            segments.push(mentionText);
        }
        lastIndex = index + mentionText.length;
    }

    if (lastIndex < bodyText.length) {
        segments.push(bodyText.slice(lastIndex));
    }

    return segments;
}

function getInitials(name: string) {
    const parts = name.trim().split(/\s+/);
    if (parts.length === 0) return "U";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}
