import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  type ComponentProps,
} from "react";
import { View, type LayoutChangeEvent, type FlatListProps } from "react-native";
import type { ChatListItem } from "@/utils/messaging/listItems";

export const MessageCellMeasurements = createContext<{
  measure: (id: string, index: number, y: number, height: number) => void;
  remove: (id: string) => void;
} | null>(null);
type Props = ComponentProps<
  NonNullable<FlatListProps<ChatListItem>["CellRendererComponent"]>
>;

/** Forward every native measurement/style back to VirtualizedList. This does
 * not add a second anchoring mechanism or assume uniform message heights. */
export default function MeasuredMessageCell({
  item,
  index,
  style,
  children,
  onLayout,
  onFocusCapture,
}: Props) {
  const measurements = useContext(MessageCellMeasurements);
  const measured = useCallback(
    (event: LayoutChangeEvent) => {
      onLayout?.(event);
      measurements?.measure(
        item.id,
        index,
        event.nativeEvent.layout.y,
        event.nativeEvent.layout.height,
      );
    },
    [measurements, item.id, index, onLayout],
  );
  useEffect(() => () => measurements?.remove(item.id), [measurements, item.id]);
  return (
    <View style={style} onLayout={measured} {...{ onFocusCapture }}>
      {children}
    </View>
  );
}
