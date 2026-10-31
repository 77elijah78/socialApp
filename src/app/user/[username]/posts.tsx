import { useLocalSearchParams } from "expo-router";
import PostCollection from "@/components/posts/PostCollection";

export default function AuthorPostsScreen() {
  const { username, postId, page } = useLocalSearchParams<{
    username: string;
    postId?: string;
    page?: string;
  }>();
  const initialPage = Math.max(
    1,
    Math.min(100_000, Number.parseInt(page ?? "1", 10) || 1),
  );
  return (
    <PostCollection
      key={`${username}:${postId}:${initialPage}`}
      source="author"
      username={username}
      selectedId={postId}
      initialPage={initialPage}
    />
  );
}
