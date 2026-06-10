import { View,Text,StyleSheet,useWindowDimensions } from "react-native";

export default function MessageCard () {
    const {width,height} = useWindowDimensions();
    return (
        <View style={styles.container}>
            
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
        alignItems: 'center',
        justifyContent: 'center',
    },

});