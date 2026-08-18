import { Linking, Clipboard, Platform } from "react-native";

const SCHEME = "yoursocialapp";

export function getPostDeepLink(postId: string): string {
  return `${SCHEME}://post/${postId}`;
}

export function getStoryDeepLink(storyId: string): string {
  return `${SCHEME}://story/${storyId}`;
}

export async function openPostDeepLink(postId: string): Promise<void> {
  const url = getPostDeepLink(postId);
  await openDeepLink(url);
}

export async function openStoryDeepLink(storyId: string): Promise<void> {
  const url = getStoryDeepLink(storyId);
  await openDeepLink(url);
}

export async function openDeepLink(url: string): Promise<void> {
  const supported = await Linking.canOpenURL(url);
  if (supported) {
    await Linking.openURL(url);
  } else {
    throw new Error(`Unable to open link: ${url}`);
  }
}

export async function copyToClipboard(text: string): Promise<void> {
  await Clipboard.setString(text);
}
