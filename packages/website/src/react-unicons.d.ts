// react-unicons.d.ts
declare module '@iconscout/react-unicons' {
  import { FC, SVGProps } from 'react';

  export interface UniconProps extends SVGProps<SVGSVGElement> {
    color?: string;
    size?: string | number;
    className?: string;
  }

  export const UilSync: ComponentType<IconProps>;
  export const UilPower: ComponentType<IconProps>;
  export const UilClock: ComponentType<IconProps>;
  export const UilHistory: ComponentType<IconProps>;
  export const UilCheck: ComponentType<IconProps>;
  export const UilBell: ComponentType<IconProps>;
  export const UilHome: FC<UniconProps>;
  export const UilLock: FC<UniconProps>;
  export const UilTimes: FC<UniconProps>;
  export const UilLockAlt: FC<UniconProps>;
  export const UilCheck: FC<UniconProps>;
  export const UilEnter: FC<UniconProps>;
  export const UilExit: FC<UniconProps>;
  export const UilSync: FC<UniconProps>;
  export const UilShieldCheck: FC<UniconProps>;
  export const UilDoorOpen: FC<UniconProps>;
  export const UilDoorClosed: FC<UniconProps>;
  export const UilTemperature: FC<UniconProps>;
  export const UilMinusCircle: FC<UniconProps>;
  export const UilPlusCircle: FC<UniconProps>;
  export const UilBolt: FC<UniconProps>;
  export const UilTemperatureHalf: FC<UniconProps>;
  export const UilPower: FC<UniconProps>;
  export const UilWind: FC<UniconProps>;
  export const UilVideo: FC<UniconProps>;
  export const UilHouseUser: FC<UniconProps>;
  export const UilKeyholeCircle: FC<UniconProps>;
  export const UilLink: FC<UniconProps>;
  export const UilLinkBroken: FC<UniconProps>;
  export const UilLockOpenAlt: FC<UniconProps>;
  export const UilBell: FC<UniconProps>;
  export const UilFire: FC<UniconProps>;
  export const UilSnowflake: FC<UniconProps>;
  export const UilTrees: FC<UniconProps>;
  export const UilCircle: FC<UniconProps>;
  export const UilRaindrops: FC<UniconProps>;
  export const UilBoltAlt: FC<UniconProps>;
  export const UilLightbulb: FC<UniconProps>;
  export const UilHistory: FC<UniconProps>;
  export const UilClockAlt: FC<UniconProps>;
  export const UilUsersAlt: FC<UniconProps>;
  export const UilCalendarAlt: FC<UniconProps>;
  export const UilSpinner: FC<UniconProps>;
  export const UilLightbulbAlt: FC<UniconProps>;
  export const UilWasher: FC<UniconProps>;
  export const UilTShirt: FC<UniconProps>;
}
