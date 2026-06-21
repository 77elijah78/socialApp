import { Redirect, router } from "expo-router";
import { useAppSelector } from "@/store/hooks";

const Home = () => {
  const isAuthenticated = useAppSelector((s) => s.auth.isAuthenticated);

  if (!isAuthenticated) {
    return <Redirect href="/login" />;
  }
  return <Redirect href="/(tabs)/home" />;
};

export default Home;
