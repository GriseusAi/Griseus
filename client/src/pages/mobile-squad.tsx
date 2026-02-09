import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { Worker, Project, ProjectAssignment, ChatMessage } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePageMeta } from "@/hooks/use-page-meta";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Users, Send, Crown, Wrench, HardHat, MapPin, MessageCircle } from "lucide-react";

const CURRENT_WORKER_ID_KEY = "flux_current_worker_id";

const roleIcons: Record<string, typeof Crown> = {
  foreman: Crown,
  lead: HardHat,
  crew: Wrench,
};

const roleLabels: Record<string, string> = {
  foreman: "Foreman",
  lead: "Team Lead",
  crew: "Crew Member",
};

export default function MobileSquad() {
  usePageMeta("My Squad | Flux", "View your team and communicate with your project squad.");

  const { data: workers } = useQuery<Worker[]>({ queryKey: ["/api/workers"] });
  const { data: projects } = useQuery<Project[]>({ queryKey: ["/api/projects"] });

  const [currentWorkerId] = useState(() => localStorage.getItem(CURRENT_WORKER_ID_KEY));

  const { data: myAssignments, isLoading: assignmentsLoading } = useQuery<ProjectAssignment[]>({
    queryKey: ["/api/project-assignments/worker", currentWorkerId],
    enabled: !!currentWorkerId,
  });

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  useEffect(() => {
    if (myAssignments && myAssignments.length > 0 && !selectedProjectId) {
      setSelectedProjectId(myAssignments[0].projectId);
    }
  }, [myAssignments, selectedProjectId]);

  const { data: projectAssignments } = useQuery<ProjectAssignment[]>({
    queryKey: ["/api/project-assignments/project", selectedProjectId],
    enabled: !!selectedProjectId,
  });

  const { data: messages, isLoading: messagesLoading } = useQuery<ChatMessage[]>({
    queryKey: ["/api/chat-messages", selectedProjectId],
    enabled: !!selectedProjectId,
    refetchInterval: 5000,
  });

  const [newMessage, setNewMessage] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const sendMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await apiRequest("POST", "/api/chat-messages", {
        projectId: selectedProjectId,
        senderId: currentWorkerId,
        content,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat-messages", selectedProjectId] });
      setNewMessage("");
    },
  });

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const selectedProject = projects?.find((p) => p.id === selectedProjectId);
  const currentWorker = workers?.find((w) => w.id === currentWorkerId);
  const myRole = myAssignments?.find((a) => a.projectId === selectedProjectId)?.role;

  const assignedProjects = myAssignments?.map((a) => projects?.find((p) => p.id === a.projectId)).filter(Boolean) as Project[] | undefined;

  const squadMembers = projectAssignments?.map((a) => {
    const worker = workers?.find((w) => w.id === a.workerId);
    return worker ? { ...worker, role: a.role } : null;
  }).filter(Boolean) as (Worker & { role: string })[] | undefined;

  const handleSend = () => {
    const trimmed = newMessage.trim();
    if (!trimmed || !currentWorkerId || !selectedProjectId) return;
    sendMutation.mutate(trimmed);
  };

  if (!currentWorkerId) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <Users className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-lg font-semibold mb-2">No Profile Selected</h2>
        <p className="text-sm text-muted-foreground">Go to Passport to select your worker profile first.</p>
      </div>
    );
  }

  if (assignmentsLoading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!myAssignments || myAssignments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <Users className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-lg font-semibold mb-2">No Active Assignments</h2>
        <p className="text-sm text-muted-foreground">You're not assigned to any projects yet. Check the Jobs tab for open positions.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" data-testid="mobile-squad">
      <div className="px-4 pt-4 pb-3 border-b">
        <div className="flex items-center gap-2 mb-3">
          <Users className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold" data-testid="text-squad-title">My Squad</h1>
        </div>

        {assignedProjects && assignedProjects.length > 1 && (
          <Select value={selectedProjectId || ""} onValueChange={setSelectedProjectId}>
            <SelectTrigger data-testid="select-project">
              <SelectValue placeholder="Select project" />
            </SelectTrigger>
            <SelectContent>
              {assignedProjects.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {selectedProject && (
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium" data-testid="text-project-name">{selectedProject.name}</span>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {selectedProject.location}
            </span>
            {myRole && (
              <Badge variant="secondary" className="capitalize" data-testid="badge-my-role">{roleLabels[myRole] || myRole}</Badge>
            )}
          </div>
        )}
      </div>

      <div className="px-4 py-3 border-b">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Team ({squadMembers?.length || 0})
        </h2>
        <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
          {squadMembers?.map((member) => {
            const RoleIcon = roleIcons[member.role] || Wrench;
            const isMe = member.id === currentWorkerId;
            return (
              <div key={member.id} className="flex flex-col items-center gap-1 min-w-[64px]" data-testid={`squad-member-${member.id}`}>
                <div className="relative">
                  <Avatar className={`h-12 w-12 ${isMe ? "ring-2 ring-primary" : ""}`}>
                    <AvatarFallback className="text-xs font-bold bg-muted">
                      {member.name.split(" ").map((n) => n[0]).join("")}
                    </AvatarFallback>
                  </Avatar>
                  <div className="absolute -bottom-0.5 -right-0.5 h-5 w-5 rounded-full bg-card border flex items-center justify-center">
                    <RoleIcon className="h-3 w-3 text-muted-foreground" />
                  </div>
                </div>
                <span className="text-[11px] font-medium text-center leading-tight truncate w-16">
                  {isMe ? "You" : member.name.split(" ")[0]}
                </span>
                <span className="text-[10px] text-muted-foreground capitalize">{roleLabels[member.role] || member.role}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-auto px-4 py-3 space-y-3" data-testid="chat-messages">
        {messagesLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-3/4" />
            <Skeleton className="h-12 w-2/3 ml-auto" />
            <Skeleton className="h-16 w-3/4" />
          </div>
        ) : messages && messages.length > 0 ? (
          <>
            <div className="flex items-center gap-2 justify-center mb-2">
              <MessageCircle className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Project Chat</span>
            </div>
            {messages.map((msg) => {
              const sender = workers?.find((w) => w.id === msg.senderId);
              const isMe = msg.senderId === currentWorkerId;
              return (
                <div key={msg.id} className={`flex gap-2 ${isMe ? "flex-row-reverse" : ""}`} data-testid={`chat-msg-${msg.id}`}>
                  {!isMe && (
                    <Avatar className="h-8 w-8 flex-shrink-0">
                      <AvatarFallback className="text-[10px] font-bold bg-muted">
                        {sender?.name.split(" ").map((n) => n[0]).join("") || "?"}
                      </AvatarFallback>
                    </Avatar>
                  )}
                  <div className={`max-w-[75%] ${isMe ? "items-end" : "items-start"}`}>
                    {!isMe && (
                      <p className="text-[11px] text-muted-foreground font-medium mb-0.5 px-1">{sender?.name.split(" ")[0] || "Unknown"}</p>
                    )}
                    <div className={`rounded-2xl px-3 py-2 text-sm ${
                      isMe
                        ? "bg-primary text-primary-foreground rounded-br-md"
                        : "bg-muted rounded-bl-md"
                    }`}>
                      {msg.content}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5 px-1">
                      {msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : ""}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={chatEndRef} />
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center py-8">
            <MessageCircle className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No messages yet. Start the conversation.</p>
          </div>
        )}
      </div>

      <div className="border-t p-3 bg-card" data-testid="chat-input-area">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Type a message..."
            className="flex-1 bg-muted rounded-full px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/50"
            data-testid="input-chat-message"
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!newMessage.trim() || sendMutation.isPending}
            data-testid="button-send-message"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
