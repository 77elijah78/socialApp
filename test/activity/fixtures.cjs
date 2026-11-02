// Shapes copied from pinned backend activity.service.ts / Kafka consumer.
const id = number => `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
const ACCOUNT_A = id(990001), ACCOUNT_B = id(990002), ACTOR = id(990003), POST = id(990004);
const phrases = { LIKE: "liked your post", COMMENT: "commented on your post", FOLLOW: "started following you",
  MESSAGE: "sent you a message", MENTION: "mentioned you", SHARE: "shared your post" };
function raw(number, patch = {}) {
  const type = patch.type ?? "LIKE";
  const postType = ["LIKE", "COMMENT", "SHARE"].includes(type);
  return { id: id(number), type, content: phrases[type], userId: ACCOUNT_A,
    actorId: ACTOR, resourceId: postType ? POST : null, postId: postType ? POST : null,
    commentId: type === "COMMENT" ? id(700000 + number) : null,
    dedupeKey: null, createdAt: new Date(Date.UTC(2026, 9, 31, 12, 0, number)).toISOString(), isRead: false,
    actor: { id: ACTOR, username: "mia", displayName: "Mia", avatarUrl: "/uploads/images/mia.jpg" },
    post: postType ? { id: POST, content: "A quiet moment in the city", imageUrls: ["/uploads/images/post.jpg"], videoUrl: null, mediaMetadata: [] } : null,
    comment: type === "COMMENT" ? { id: id(700000 + number), postId: POST, content: "Love this moment!" } : null,
    ...patch };
}
function event(row) {
  const { id, commentId, createdAt, type, content, actorId, resourceId } = row;
  return { id, commentId, createdAt, type, content, actorId, resourceId };
}
function envelope(items = [], { page = 1, limit = 20, total = items.length, unreadCount = items.filter(item => !item.isRead).length } = {}) {
  return { success: true, message: "Activity", data: { items, total, unreadCount },
    meta: { page, limit, total, totalPages: Math.ceil(total / limit), hasNext: page * limit < total, hasPrev: page > 1 } };
}
module.exports = { id, raw, event, envelope, ACCOUNT_A, ACCOUNT_B, ACTOR, POST };
