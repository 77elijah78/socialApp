import { Redirect, router } from "expo-router";
import { useAppSelector } from "@/store/hooks";
import { roomStore } from "@/db/RoomStore";
import { useRooms } from "@/hooks/useRooms";

const Home = () => {
  const { findRoom } = useRooms();
  const isAuthenticated = useAppSelector((s) => s.auth.isAuthenticated);
  const currentUserId = async () => {
    await findRoom("123");
  };

  if (!isAuthenticated) {
    return <Redirect href="/login" />;
  }
  currentUserId();
  return <Redirect href="/(tabs)/home" />;
};

export default Home;
