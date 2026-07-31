// Common reusable Button component
import React from 'react';
import { TouchableOpacity,StyleSheet,Text,Image } from 'react-native';
import { PrimaryButtonProps } from '@/types/index';
import theme from '@/constants/theme';

export default function PrimaryButton  ({
    style,
    title,
    onPress,
    rightIcon,
    leftIcon,
    iconStyle,
    textStyle
}: PrimaryButtonProps)  {
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
        backgroundColor: theme.COLORS.indigo,
        paddingVertical: theme.SPACING.lg,
        paddingHorizontal: theme.SPACING.xxxl,
        borderRadius: theme.BORDER_RADIUS.lg,
        alignItems: 'center',
        justifyContent: 'center',
        height: 60,
        flexDirection: 'row',
    },
    buttonText: {
        color: theme.COLORS.textWhite,
        fontSize: theme.TYPOGRAPHY.fontSize.xl7,
        fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
    },
    icon: {
        width: theme.SIZING.iconSm,
        height: theme.SIZING.iconSm,
        marginLeft: theme.SPACING.md,
    },
});
