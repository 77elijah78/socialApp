// Common reusable Button component
import React from 'react';
import { TouchableOpacity,StyleSheet,Text,Image } from 'react-native';
import primaryButtonProps from '@/types/index';

export default function PrimaryButton  ({
    style,
    title,
    onPress,
    rightIcon,
    leftIcon,
    iconStyle,
    textStyle
}:primaryButtonProps)  {
    return (
        <TouchableOpacity style={[styles.button,{...style}]} onPress={onPress}>
            {leftIcon && <Image source={leftIcon} style={[styles.icon,{...iconStyle}]} />}
<Text style={[styles.buttonText,{...textStyle}]}>{title}</Text>
{rightIcon && 
    <Image  source={rightIcon} style={[styles.icon,{...iconStyle}]}/>
}      
        </TouchableOpacity>
    )
}

const styles = StyleSheet.create({
    button: {
        backgroundColor: '#4F46E5',
        paddingVertical: 12,
        paddingHorizontal: 24,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        height: 60,
        flexDirection: 'row',
    },
    buttonText: {
        color: '#FFFFFF',
        fontSize: 24,
        fontWeight: 'bold',
    },
    icon: {
        width: 24,
        height: 24,
        marginLeft: 8,
    },
});
