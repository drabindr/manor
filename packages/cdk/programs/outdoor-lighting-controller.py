#!/usr/bin/env python3
"""
TP-Link Kasa Automated Outdoor Lighting Controller

This script automatically manages outdoor lighting based on sunset times and schedule:
- Turns OFF outdoor lights during daytime
- Operates lights only from sunset to 9 PM
- Turns OFF lights after 9 PM
- Location: 720 Front Rd, Pickering, ON

Features:
- Smart scheduling with adaptive check intervals
- Manual override protection during daytime
- 15-minute grace period for after-hours manual activation
- Comprehensive logging and status reporting

Requirements:
    pip install python-kasa astral pytz

Usage:
    python outdoor-lighting-controller.py
    python outdoor-lighting-controller.py --service (for background automation)
"""

import asyncio
import json
import logging
import sys
from datetime import datetime, time, timedelta
from typing import List, Dict, Any, Set
from zoneinfo import ZoneInfo

from kasa import Discover, Device
from kasa.iot import IotDevice, IotPlug, IotBulb, IotStrip, IotDimmer

# Astral for sunrise/sunset calculations
from astral import LocationInfo
from astral.sun import sun

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('outdoor_lighting.log'),
        logging.StreamHandler()
    ]
)


class OutdoorLightingController:
    """Automated controller for outdoor lighting based on sunset/sunrise and schedule"""
    
    def __init__(self, check_interval_seconds: int = 300):
        self.devices: Dict[str, Device] = {}
        self.outdoor_device_names = {
            'outdoor potlights', 'outdoor lamps', 'outdoor lights', 
            'potlights', 'porch', 'exterior', 'driveway', 'garden'
        }
        self.location = LocationInfo("Pickering", "Canada", "America/Toronto", 43.8384, -79.0868)  # 720 Front Rd, Pickering
        self.timezone = ZoneInfo("America/Toronto")
        self.end_time = time(21, 0)  # 9 PM
        self.logger = logging.getLogger(__name__)
        
        # Configurable check interval with safety limits
        if check_interval_seconds < 10:
            self.logger.warning(f"⚠️ Check interval {check_interval_seconds}s is very aggressive and may stress devices")
            self.logger.warning("⚠️ Consider using 30-60 seconds minimum for device longevity")
        elif check_interval_seconds < 30:
            self.logger.warning(f"⚠️ Check interval {check_interval_seconds}s is aggressive - monitor device performance")
        
        self.check_interval = max(5, check_interval_seconds)  # Minimum 5 seconds safety limit
        self.last_device_scan = None
        self.device_scan_interval = max(3600, self.check_interval * 12)  # Re-scan devices every hour or 12 cycles, whichever is longer
        
        # Smart optimization: track when we actually need to check
        self.last_schedule_change = None
        self.schedule_transition_times = []  # Times when lights should change state
        
        # Grace period for after-hours manual activation (15 minutes)
        self.after_hours_grace_period = 15 * 60  # 15 minutes in seconds
        self.device_grace_periods: Dict[str, datetime] = {}  # Track when devices were manually turned on during off-hours
        
    async def discover_outdoor_devices(self) -> Dict[str, Device]:
        """Discover and filter outdoor lighting devices"""
        self.logger.info("🔍 Discovering outdoor lighting devices...")
        
        try:
            all_devices = await Discover.discover(timeout=5)
            outdoor_devices = {}
            
            for ip, device in all_devices.items():
                await device.update()
                device_name = device.alias.lower()
                
                # Check if device name contains outdoor lighting keywords
                if any(keyword in device_name for keyword in self.outdoor_device_names):
                    outdoor_devices[ip] = device
                    self.logger.info(f"📱 Found outdoor device: {device.alias} at {ip}")
            
            self.devices = outdoor_devices
            self.last_device_scan = datetime.now(self.timezone)
            self.logger.info(f"✅ Found {len(outdoor_devices)} outdoor lighting device(s)")
            
            return outdoor_devices
            
        except Exception as e:
            self.logger.error(f"❌ Device discovery failed: {e}")
            return {}
    
    def get_sun_times(self) -> Dict[str, datetime]:
        """Get today's sunrise and sunset times for Pickering"""
        try:
            today = datetime.now(self.timezone).date()
            sun_times = sun(self.location.observer, date=today, tzinfo=self.timezone)
            
            return {
                'sunrise': sun_times['sunrise'],
                'sunset': sun_times['sunset']
            }
        except Exception as e:
            self.logger.error(f"❌ Failed to get sun times: {e}")
            # Fallback times if calculation fails
            today = datetime.now(self.timezone)
            return {
                'sunrise': today.replace(hour=6, minute=0, second=0, microsecond=0),
                'sunset': today.replace(hour=19, minute=0, second=0, microsecond=0)
            }
    
    def should_lights_be_on(self) -> bool:
        """Determine if outdoor lights should be on based on time and sunset"""
        now = datetime.now(self.timezone)
        current_time = now.time()
        sun_times = self.get_sun_times()
        
        sunset_time = sun_times['sunset'].time()
        
        # Update schedule transition times for optimization
        today = now.replace(hour=0, minute=0, second=0, microsecond=0)
        self.schedule_transition_times = [
            sun_times['sunset'],  # Lights should turn ON
            today.replace(hour=21, minute=0, second=0, microsecond=0)  # Lights should turn OFF at 9 PM
        ]
        
        # Lights should be ON only between sunset and 9 PM
        if sunset_time <= current_time <= self.end_time:
            return True
        
        # Handle case where sunset is after 9 PM (unlikely but possible in summer)
        if sunset_time > self.end_time:
            return False
            
        return False
    
    def get_next_schedule_change(self) -> datetime:
        """Get the next time the schedule will change (sunset or 9 PM)"""
        now = datetime.now(self.timezone)
        
        for transition_time in self.schedule_transition_times:
            if transition_time > now:
                return transition_time
        
        # If no transitions today, check tomorrow's sunset
        tomorrow = now + timedelta(days=1)
        tomorrow_sun = sun(self.location.observer, date=tomorrow.date(), tzinfo=self.timezone)
        return tomorrow_sun['sunset']
    
    def should_check_aggressively(self) -> bool:
        """Determine if we should check more frequently (near schedule transitions or during daytime only)"""
        if not self.schedule_transition_times:
            return True  # Check aggressively if we don't know the schedule yet
        
        now = datetime.now(self.timezone)
        next_change = self.get_next_schedule_change()
        should_be_on = self.should_lights_be_on()
        current_hour = now.hour
        sun_times = self.get_sun_times()
        sunset_hour = sun_times['sunset'].hour
        
        # Check aggressively within 10 minutes of a schedule change
        time_until_change = (next_change - now).total_seconds()
        near_transition = 0 <= time_until_change <= 600  # 10 minutes
        
        # Only check aggressively during DAYTIME when lights should be OFF
        # After 9 PM, we give a 15-minute grace period, so no need for aggressive checking
        daytime_override_protection = not should_be_on and current_hour < sunset_hour
        
        return near_transition or daytime_override_protection
    
    def is_device_in_grace_period(self, device_alias: str) -> bool:
        """Check if a device is within its after-hours grace period"""
        if device_alias not in self.device_grace_periods:
            return False
        
        now = datetime.now(self.timezone)
        grace_start = self.device_grace_periods[device_alias]
        elapsed = (now - grace_start).total_seconds()
        
        return elapsed < self.after_hours_grace_period
    
    def start_device_grace_period(self, device_alias: str):
        """Start a 15-minute grace period for a device that was manually turned on after hours"""
        self.device_grace_periods[device_alias] = datetime.now(self.timezone)
        grace_end = datetime.now(self.timezone) + timedelta(seconds=self.after_hours_grace_period)
        self.logger.info(f"🕐 Grace period started for {device_alias} - will auto-turn-off at {grace_end.strftime('%H:%M')}")
    
    def clear_device_grace_period(self, device_alias: str):
        """Clear the grace period for a device"""
        if device_alias in self.device_grace_periods:
            del self.device_grace_periods[device_alias]
            self.logger.debug(f"🧹 Cleared grace period for {device_alias}")
    
    def cleanup_expired_grace_periods(self) -> None:
        """Clean up expired grace periods to keep dictionary tidy"""
        now = datetime.now(self.timezone)
        expired_devices = []
        
        for device_alias, start_time in self.device_grace_periods.items():
            if (now - start_time).total_seconds() > self.after_hours_grace_period:
                expired_devices.append(device_alias)
        
        for device_alias in expired_devices:
            del self.device_grace_periods[device_alias]
            self.logger.debug(f"🧹 Cleaned up expired grace period for {device_alias}")
    
    async def startup_device_check(self):
        """Perform an immediate check of all devices on service startup to correct any incorrect states"""
        self.logger.info("🔍 Performing startup device state check...")
        
        # Discover devices first
        await self.discover_outdoor_devices()
        
        if not self.devices:
            self.logger.warning("⚠️ No outdoor devices found during startup check")
            return
        
        should_be_on = self.should_lights_be_on()
        self.logger.info(f"🔍 Startup check: lights should be {'ON' if should_be_on else 'OFF'}")
        
        devices_corrected = False
        for ip, device in self.devices.items():
            try:
                await device.update()
                current_state = device.is_on
                
                if not should_be_on and current_state:
                    # Light is on when it should be off - turn it off immediately
                    await device.turn_off()
                    self.logger.info(f"🔌 Startup correction: Turned OFF {device.alias} (was incorrectly ON)")
                    devices_corrected = True
                elif should_be_on and not current_state:
                    # Light is off when it should be on - turn it on
                    await device.turn_on()
                    self.logger.info(f"💡 Startup correction: Turned ON {device.alias} (was incorrectly OFF)")
                    devices_corrected = True
                else:
                    state_desc = "ON" if current_state else "OFF"
                    self.logger.debug(f"✅ Startup check: {device.alias} is correctly {state_desc}")
                    
            except Exception as e:
                self.logger.error(f"❌ Failed to check device {device.alias} during startup: {e}")
        
        if devices_corrected:
            self.logger.info("✅ Startup device corrections completed")
        else:
            self.logger.info("✅ All devices were in correct state at startup")
    
    async def check_and_control_device(self, device: Device) -> bool:
        """Check and control a single outdoor device with grace period support
        
        Returns:
            True if device state was changed, False otherwise
        """
        try:
            await device.update()
            should_be_on = self.should_lights_be_on()
            current_state = device.is_on
            now = datetime.now(self.timezone)
            current_hour = now.hour
            sun_times = self.get_sun_times()
            sunset_hour = sun_times['sunset'].hour
            
            if should_be_on and not current_state:
                await device.turn_on()
                self.logger.info(f"💡 Turned ON: {device.alias} (scheduled lighting time)")
                # Clear any existing grace period since lights should be on now
                self.clear_device_grace_period(device.alias)
                return True
                
            elif not should_be_on and current_state:
                # Light is on when it should be off - check if this is a grace period situation
                if current_hour >= 21:  # After 9 PM
                    # Check if device is in grace period
                    if self.is_device_in_grace_period(device.alias):
                        # Device is in grace period, don't turn it off yet
                        remaining_time = self.after_hours_grace_period - (now - self.device_grace_periods[device.alias]).total_seconds()
                        remaining_minutes = int(remaining_time / 60)
                        self.logger.debug(f"🕐 {device.alias} in grace period - {remaining_minutes} minutes remaining")
                        return False
                    elif device.alias in self.device_grace_periods:
                        # Grace period has expired, turn off the light
                        await device.turn_off()
                        self.clear_device_grace_period(device.alias)
                        now_time = now.strftime('%H:%M')
                        self.logger.info(f"🔌 Turned OFF: {device.alias} (grace period expired at {now_time})")
                        return True
                    else:
                        # This is a new manual activation - start a grace period
                        self.start_device_grace_period(device.alias)
                        return False
                else:
                    # Daytime override - turn off immediately
                    await device.turn_off()
                    now_time = now.strftime('%H:%M')
                    self.logger.info(f"🔌 Turned OFF: {device.alias} (manual override detected at {now_time} - daytime)")
                    self.clear_device_grace_period(device.alias)
                    return True
                
            else:
                # Device is in correct state
                if current_state:
                    # Light is on and should be on - clear any grace period
                    self.clear_device_grace_period(device.alias)
                
                state_desc = "ON" if current_state else "OFF"
                self.logger.debug(f"✅ {device.alias} is correctly {state_desc}")
                return False
                
        except Exception as e:
            self.logger.error(f"❌ Failed to control {device.alias}: {e}")
            return False
    
    async def monitor_and_control_lights(self):
        """Main monitoring loop for outdoor lights with smart scheduling"""
        self.logger.info("🚀 Starting outdoor lighting automation...")
        self.logger.info(f"⏰ Base check interval: {self.check_interval} seconds")
        
        # Initial startup check - immediately verify and correct device states
        await self.startup_device_check()
        
        while True:
            try:
                # Re-scan devices periodically to catch new devices or recover from network issues
                now = datetime.now(self.timezone)
                if (self.last_device_scan is None or 
                    (now - self.last_device_scan).total_seconds() > self.device_scan_interval):
                    await self.discover_outdoor_devices()
                
                if not self.devices:
                    self.logger.warning("⚠️ No outdoor devices found, retrying discovery...")
                    await self.discover_outdoor_devices()
                    if not self.devices:
                        self.logger.warning("⚠️ Still no devices found, waiting before retry...")
                        await asyncio.sleep(self.check_interval)
                        continue
                
                # Get current lighting schedule info
                sun_times = self.get_sun_times()
                should_be_on = self.should_lights_be_on()
                next_change = self.get_next_schedule_change()
                aggressive_check = self.should_check_aggressively()
                
                self.logger.info(f"🌅 Today's sunset: {sun_times['sunset'].strftime('%H:%M')}")
                self.logger.info(f"🕘 Lights should be: {'ON' if should_be_on else 'OFF'}")
                
                if aggressive_check:
                    if not should_be_on:
                        current_hour = now.hour
                        sun_times = self.get_sun_times()
                        sunset_hour = sun_times['sunset'].hour
                        
                        if current_hour < sunset_hour:
                            self.logger.info(f"🔥 Daytime override protection - checking every minute for manual changes")
                        else:
                            self.logger.info(f"🔥 After-hours override protection - checking every minute for manual changes")
                    else:
                        self.logger.info(f"🔥 Aggressive checking - next schedule change at {next_change.strftime('%H:%M')}")
                
                # Control each outdoor device
                devices_changed = False
                for ip, device in self.devices.items():
                    changed = await self.check_and_control_device(device)
                    if changed:
                        devices_changed = True
                
                # Clean up expired grace periods
                self.cleanup_expired_grace_periods()
                
                # Calculate next check interval (smart scheduling)
                current_interval = self.check_interval
                
                # Check if any devices are in grace periods - if so, don't extend intervals
                has_active_grace_periods = bool(self.device_grace_periods)
                
                if aggressive_check:
                    # Check more frequently near schedule transitions
                    current_interval = min(self.check_interval, 60)  # Max 1 minute during transitions
                elif has_active_grace_periods:
                    # If devices are in grace periods, check every 2 minutes to ensure timely turn-off
                    current_interval = min(self.check_interval, 120)  # Max 2 minutes when grace periods active
                elif not devices_changed and self.check_interval > 60:
                    # If nothing changed and we're in a stable period, we can check less frequently
                    time_until_change = (next_change - now).total_seconds()
                    if time_until_change > 3600:  # More than 1 hour until next change
                        current_interval = min(self.check_interval * 2, 900)  # Max 15 minutes when stable
                
                # Log next check time
                next_check = now + timedelta(seconds=current_interval)
                if has_active_grace_periods:
                    grace_devices = list(self.device_grace_periods.keys())
                    self.logger.info(f"⏰ Next check at: {next_check.strftime('%H:%M:%S')} (interval: {current_interval}s) - monitoring grace periods for: {', '.join(grace_devices)}")
                else:
                    self.logger.info(f"⏰ Next check at: {next_check.strftime('%H:%M:%S')} (interval: {current_interval}s)")
                
                # Wait before next check
                await asyncio.sleep(current_interval)
                
            except KeyboardInterrupt:
                self.logger.info("🛑 Automation stopped by user")
                break
            except Exception as e:
                self.logger.error(f"❌ Error in monitoring loop: {e}")
                self.logger.info(f"⏳ Retrying in {self.check_interval} seconds...")
                await asyncio.sleep(self.check_interval)
    
    async def status_report(self) -> Dict[str, Any]:
        """Generate a status report of the lighting system"""
        try:
            if not self.devices:
                await self.discover_outdoor_devices()
            
            sun_times = self.get_sun_times()
            should_be_on = self.should_lights_be_on()
            now = datetime.now(self.timezone)
            
            device_status = {}
            for ip, device in self.devices.items():
                await device.update()
                device_status[device.alias] = {
                    'ip': ip,
                    'is_on': device.is_on,
                    'should_be_on': should_be_on,
                    'correct_state': device.is_on == should_be_on
                }
            
            return {
                'timestamp': now.isoformat(),
                'current_time': now.strftime('%H:%M:%S'),
                'sunset_today': sun_times['sunset'].strftime('%H:%M'),
                'sunrise_today': sun_times['sunrise'].strftime('%H:%M'),
                'lights_should_be_on': should_be_on,
                'schedule': f"Sunset ({sun_times['sunset'].strftime('%H:%M')}) to 21:00",
                'devices': device_status,
                'total_devices': len(self.devices)
            }
            
        except Exception as e:
            self.logger.error(f"❌ Failed to generate status report: {e}")
            return {'error': str(e)}


# Keep the original TPLinkController for manual operations and demos
class TPLinkController:
    """Controller class for managing TP-Link smart devices"""
    
    def __init__(self):
        self.devices: Dict[str, Device] = {}
    
    async def discover_devices(self, timeout: int = 3) -> Dict[str, Device]:
        """
        Discover all TP-Link devices on the local network
        
        Args:
            timeout: Discovery timeout in seconds
            
        Returns:
            Dictionary of discovered devices {ip: device}
        """
        print(f"🔍 Discovering TP-Link devices (timeout: {timeout}s)...")
        
        try:
            devices = await Discover.discover(timeout=timeout)
            self.devices = devices
            
            print(f"✅ Found {len(devices)} device(s)")
            for ip, device in devices.items():
                await device.update()
                print(f"  📱 {device.alias} ({device.model}) at {ip}")
                
            return devices
            
        except Exception as e:
            print(f"❌ Discovery failed: {e}")
            return {}
    
    async def get_device_info(self, device: Device) -> Dict[str, Any]:
        """Get comprehensive device information"""
        await device.update()
        
        info = {
            "alias": device.alias,
            "model": device.model,
            "device_type": str(type(device).__name__),
            "host": device.host,
            "mac": device.mac,
            "is_on": device.is_on,
            "rssi": getattr(device, 'rssi', 'N/A'),
            "hw_info": device.hw_info,
            "features": list(device.features)
        }
        
        # Add device-specific information
        if isinstance(device, IotPlug):
            # Safely get energy attributes
            info.update({
                "current_consumption": getattr(device, 'current_consumption', None),
                "today_energy": getattr(device, 'today_energy', None),
                "this_month_energy": getattr(device, 'this_month_energy', None)
            })
            
        elif isinstance(device, IotBulb):
            info.update({
                "brightness": getattr(device, 'brightness', None),
                "color_temp": getattr(device, 'color_temp', None) if getattr(device, 'is_variable_color_temp', False) else None,
                "hsv": getattr(device, 'hsv', None) if getattr(device, 'is_color', False) else None,
                "is_dimmable": getattr(device, 'is_dimmable', False),
                "is_color": getattr(device, 'is_color', False),
                "is_variable_color_temp": getattr(device, 'is_variable_color_temp', False)
            })
            
        elif isinstance(device, IotStrip):
            children = getattr(device, 'children', [])
            info.update({
                "children": [child.alias for child in children],
                "child_count": len(children)
            })
            
        return info
    
    async def control_plug(self, device: IotPlug, action: str) -> bool:
        """
        Control a smart plug
        
        Args:
            device: SmartPlug instance
            action: 'on', 'off', or 'toggle'
            
        Returns:
            True if successful
        """
        try:
            if action == "on":
                await device.turn_on()
                print(f"🔌 Turned ON: {device.alias}")
            elif action == "off":
                await device.turn_off()
                print(f"🔌 Turned OFF: {device.alias}")
            elif action == "toggle":
                if device.is_on:
                    await device.turn_off()
                    print(f"🔌 Toggled OFF: {device.alias}")
                else:
                    await device.turn_on()
                    print(f"🔌 Toggled ON: {device.alias}")
            else:
                print(f"❌ Invalid action: {action}")
                return False
                
            return True
            
        except Exception as e:
            print(f"❌ Failed to control plug {device.alias}: {e}")
            return False
    
    async def control_bulb(self, device: IotBulb, **kwargs) -> bool:
        """
        Control a smart bulb
        
        Args:
            device: IotBulb instance
            **kwargs: Control parameters
                - state: 'on', 'off', 'toggle'
                - brightness: 0-100
                - color_temp: Color temperature in Kelvin
                - hue: 0-360
                - saturation: 0-100
                - value: 0-100 (brightness for HSV)
                
        Returns:
            True if successful
        """
        try:
            state = kwargs.get('state')
            brightness = kwargs.get('brightness')
            color_temp = kwargs.get('color_temp')
            hue = kwargs.get('hue')
            saturation = kwargs.get('saturation')
            value = kwargs.get('value')
            
            # Handle state changes
            if state == "on":
                await device.turn_on()
                print(f"💡 Turned ON: {device.alias}")
            elif state == "off":
                await device.turn_off()
                print(f"💡 Turned OFF: {device.alias}")
            elif state == "toggle":
                if device.is_on:
                    await device.turn_off()
                    print(f"💡 Toggled OFF: {device.alias}")
                else:
                    await device.turn_on()
                    print(f"💡 Toggled ON: {device.alias}")
            
            # Handle brightness
            if brightness is not None and getattr(device, 'is_dimmable', False):
                await device.set_brightness(brightness)
                print(f"💡 Set brightness to {brightness}%: {device.alias}")
            
            # Handle color temperature
            if color_temp is not None and getattr(device, 'is_variable_color_temp', False):
                await device.set_color_temp(color_temp)
                print(f"💡 Set color temperature to {color_temp}K: {device.alias}")
            
            # Handle HSV color
            if all(x is not None for x in [hue, saturation, value]) and getattr(device, 'is_color', False):
                await device.set_hsv(hue, saturation, value)
                print(f"💡 Set HSV to ({hue}, {saturation}, {value}): {device.alias}")
            
            return True
            
        except Exception as e:
            print(f"❌ Failed to control bulb {device.alias}: {e}")
            return False
    
    async def control_strip(self, device: IotStrip, child_index: int = None, action: str = "toggle") -> bool:
        """
        Control a smart power strip
        
        Args:
            device: SmartStrip instance
            child_index: Index of child outlet (None for all)
            action: 'on', 'off', or 'toggle'
            
        Returns:
            True if successful
        """
        try:
            if child_index is not None:
                # Control specific outlet
                children = getattr(device, 'children', [])
                if child_index < len(children):
                    child = children[child_index]
                    if action == "on":
                        await child.turn_on()
                        print(f"🔌 Outlet {child_index} ON: {child.alias}")
                    elif action == "off":
                        await child.turn_off()
                        print(f"🔌 Outlet {child_index} OFF: {child.alias}")
                    elif action == "toggle":
                        if child.is_on:
                            await child.turn_off()
                            print(f"🔌 Outlet {child_index} toggled OFF: {child.alias}")
                        else:
                            await child.turn_on()
                            print(f"🔌 Outlet {child_index} toggled ON: {child.alias}")
                else:
                    print(f"❌ Invalid child index: {child_index}")
                    return False
            else:
                # Control entire strip
                if action == "on":
                    await device.turn_on()
                    print(f"🔌 All outlets ON: {device.alias}")
                elif action == "off":
                    await device.turn_off()
                    print(f"🔌 All outlets OFF: {device.alias}")
                elif action == "toggle":
                    if device.is_on:
                        await device.turn_off()
                        print(f"🔌 All outlets toggled OFF: {device.alias}")
                    else:
                        await device.turn_on()
                        print(f"🔌 All outlets toggled ON: {device.alias}")
            
            return True
            
        except Exception as e:
            print(f"❌ Failed to control strip {device.alias}: {e}")
            return False
    
    async def get_energy_usage(self, device: Device) -> Dict[str, Any]:
        """Get energy usage information for devices that support it"""
        await device.update()
        
        energy_info = {}
        
        if hasattr(device, 'current_consumption'):
            energy_info['current_consumption'] = device.current_consumption
        
        if hasattr(device, 'today_energy'):
            energy_info['today_energy'] = device.today_energy
            
        if hasattr(device, 'this_month_energy'):
            energy_info['this_month_energy'] = device.this_month_energy
            
        return energy_info
    
    async def set_device_alias(self, device: Device, new_alias: str) -> bool:
        """Set a new alias for a device"""
        try:
            old_alias = device.alias
            await device.set_alias(new_alias)
            print(f"📝 Renamed '{old_alias}' to '{new_alias}'")
            return True
        except Exception as e:
            print(f"❌ Failed to rename device: {e}")
            return False


async def demo_basic_operations():
    """Demonstrate basic device operations"""
    print("\n" + "="*50)
    print("🏠 TP-Link Kasa Local Control Demo")
    print("="*50)
    
    controller = TPLinkController()
    
    # Discover devices
    devices = await controller.discover_devices(timeout=5)
    
    if not devices:
        print("❌ No devices found. Make sure TP-Link devices are on the same network.")
        return
    
    # Display device information
    print("\n📋 Device Information:")
    print("-" * 30)
    
    for ip, device in devices.items():
        info = await controller.get_device_info(device)
        print(f"\n🔍 {info['alias']} ({info['model']})")
        print(f"   IP: {ip}")
        print(f"   Type: {info['device_type']}")
        print(f"   Status: {'ON' if info['is_on'] else 'OFF'}")
        print(f"   Signal: {info['rssi']} dBm")
        
        # Show energy info if available
        energy = await controller.get_energy_usage(device)
        if energy:
            print(f"   Energy: {energy}")
    
    # Demonstrate control operations
    print("\n🎮 Control Demonstrations:")
    print("-" * 30)
    
    for ip, device in devices.items():
        await device.update()
        
        if isinstance(device, IotPlug) or 'Plug' in str(type(device)):
            print(f"\n🔌 Testing Smart Plug: {device.alias}")
            await controller.control_plug(device, "toggle")
            await asyncio.sleep(2)
            await controller.control_plug(device, "toggle")
            
        elif isinstance(device, IotBulb) or 'Bulb' in str(type(device)):
            print(f"\n💡 Testing Smart Bulb: {device.alias}")
            
            # Toggle on/off
            await controller.control_bulb(device, state="toggle")
            await asyncio.sleep(1)
            
            if device.is_on:
                # Test brightness if dimmable
                if getattr(device, 'is_dimmable', False):
                    await controller.control_bulb(device, brightness=50)
                    await asyncio.sleep(1)
                    await controller.control_bulb(device, brightness=100)
                
                # Test color temperature if supported
                if getattr(device, 'is_variable_color_temp', False):
                    await controller.control_bulb(device, color_temp=3000)  # Warm
                    await asyncio.sleep(1)
                    await controller.control_bulb(device, color_temp=6500)  # Cool
                
                # Test color if supported
                if getattr(device, 'is_color', False):
                    await controller.control_bulb(device, hue=0, saturation=100, value=100)    # Red
                    await asyncio.sleep(1)
                    await controller.control_bulb(device, hue=240, saturation=100, value=100)  # Blue
                    await asyncio.sleep(1)
                    await controller.control_bulb(device, hue=120, saturation=100, value=100)  # Green
            
        elif isinstance(device, IotStrip) or 'Strip' in str(type(device)):
            print(f"\n🔌 Testing Smart Strip: {device.alias}")
            
            # Toggle individual outlets
            children = getattr(device, 'children', [])
            for i in range(len(children)):
                await controller.control_strip(device, child_index=i, action="toggle")
                await asyncio.sleep(1)
            
            # Toggle all outlets
            await controller.control_strip(device, action="toggle")
        else:
            # Generic device control
            print(f"\n🔄 Testing Generic Device: {device.alias}")
            if device.is_on:
                await device.turn_off()
                print(f"🔄 Turned OFF: {device.alias}")
                await asyncio.sleep(1)
                await device.turn_on()
                print(f"🔄 Turned ON: {device.alias}")
            else:
                await device.turn_on()
                print(f"🔄 Turned ON: {device.alias}")
                await asyncio.sleep(1)
                await device.turn_off()
                print(f"🔄 Turned OFF: {device.alias}")


async def demo_advanced_features():
    """Demonstrate advanced features"""
    print("\n" + "="*50)
    print("🔧 Advanced Features Demo")
    print("="*50)
    
    controller = TPLinkController()
    devices = await controller.discover_devices(timeout=3)
    
    if not devices:
        return
    
    # Create schedules, get system info, etc.
    for ip, device in devices.items():
        await device.update()
        
        print(f"\n🔍 Advanced info for {device.alias}:")
        
        # System information
        print(f"   Firmware: {device.hw_info.get('sw_ver', 'Unknown')}")
        print(f"   Hardware: {device.hw_info.get('hw_ver', 'Unknown')}")
        print(f"   Features: {', '.join(device.features)}")
        
        # Time information
        try:
            time_info = await device.get_time()
            print(f"   Device Time: {time_info}")
        except:
            print("   Device Time: Not available")


async def interactive_control():
    """Interactive control mode"""
    print("\n" + "="*50)
    print("🎮 Interactive Control Mode")
    print("="*50)
    
    controller = TPLinkController()
    devices = await controller.discover_devices(timeout=3)
    
    if not devices:
        print("❌ No devices found for interactive control.")
        return
    
    # List devices with numbers
    device_list = list(devices.items())
    print("\n📱 Available Devices:")
    for i, (ip, device) in enumerate(device_list):
        await device.update()
        status = "ON" if device.is_on else "OFF"
        print(f"   {i+1}. {device.alias} ({device.model}) - {status}")
    
    print("\n🎯 Interactive commands:")
    print("   - Type device number + action (e.g., '1 toggle', '2 on', '3 off')")
    print("   - For bulbs: '1 brightness 75', '1 color_temp 4000'")
    print("   - Type 'list' to see devices again")
    print("   - Type 'quit' to exit")
    
    while True:
        try:
            command = input("\n> ").strip().lower()
            
            if command == "quit":
                break
            elif command == "list":
                for i, (ip, device) in enumerate(device_list):
                    await device.update()
                    status = "ON" if device.is_on else "OFF"
                    print(f"   {i+1}. {device.alias} ({device.model}) - {status}")
                continue
            
            parts = command.split()
            if len(parts) < 2:
                print("❌ Invalid command. Use: <device_number> <action>")
                continue
            
            try:
                device_num = int(parts[0]) - 1
                if device_num < 0 or device_num >= len(device_list):
                    print("❌ Invalid device number")
                    continue
                
                ip, device = device_list[device_num]
                action = parts[1]
                
                if isinstance(device, IotPlug) or 'Plug' in str(type(device)):
                    await controller.control_plug(device, action)
                elif isinstance(device, IotBulb) or 'Bulb' in str(type(device)):
                    if action in ['on', 'off', 'toggle']:
                        await controller.control_bulb(device, state=action)
                    elif action == 'brightness' and len(parts) > 2:
                        brightness = int(parts[2])
                        await controller.control_bulb(device, brightness=brightness)
                    elif action == 'color_temp' and len(parts) > 2:
                        color_temp = int(parts[2])
                        await controller.control_bulb(device, color_temp=color_temp)
                    else:
                        print("❌ Invalid bulb command")
                elif isinstance(device, IotStrip) or 'Strip' in str(type(device)):
                    await controller.control_strip(device, action=action)
                else:
                    # Generic device control
                    if action == "on":
                        await device.turn_on()
                        print(f"🔄 Turned ON: {device.alias}")
                    elif action == "off":
                        await device.turn_off()
                        print(f"🔄 Turned OFF: {device.alias}")
                    elif action == "toggle":
                        if device.is_on:
                            await device.turn_off()
                            print(f"🔄 Toggled OFF: {device.alias}")
                        else:
                            await device.turn_on()
                            print(f"🔄 Toggled ON: {device.alias}")
                    else:
                        print("❌ Invalid action for this device type")
                
            except ValueError:
                print("❌ Invalid device number")
            except Exception as e:
                print(f"❌ Command failed: {e}")
                
        except KeyboardInterrupt:
            break
    
    print("\n👋 Goodbye!")


async def main():
    """Main function with automated outdoor lighting control"""
    print("🏠 TP-Link Outdoor Lighting Automation")
    print("📍 Location: 720 Front Rd, Pickering, ON")
    print("⏰ Schedule: Sunset to 9:00 PM")
    print("=" * 50)
    
    # Ask user what mode they want
    print("\n🎮 Select operation mode:")
    print("1. Start automated outdoor lighting control (recommended)")
    print("2. Show current status report")
    print("3. Run original demo/manual control")
    print("4. Exit")
    
    try:
        choice = input("\nEnter your choice (1-4): ").strip()
        
        if choice == "1":
            # Start automated lighting control
            controller = OutdoorLightingController()
            await controller.monitor_and_control_lights()
            
        elif choice == "2":
            # Show status report
            controller = OutdoorLightingController()
            status = await controller.status_report()
            
            print("\n" + "=" * 50)
            print("📊 OUTDOOR LIGHTING STATUS REPORT")
            print("=" * 50)
            
            if 'error' in status:
                print(f"❌ Error: {status['error']}")
            else:
                print(f"🕐 Current Time: {status['current_time']}")
                print(f"🌅 Today's Sunset: {status['sunset_today']}")
                print(f"🌄 Today's Sunrise: {status['sunrise_today']}")
                print(f"📅 Active Schedule: {status['schedule']}")
                print(f"💡 Lights Should Be: {'ON' if status['lights_should_be_on'] else 'OFF'}")
                print(f"🔌 Total Devices: {status['total_devices']}")
                
                if status['devices']:
                    print("\n📱 Device Status:")
                    for name, info in status['devices'].items():
                        state_icon = "✅" if info['correct_state'] else "⚠️"
                        current_state = "ON" if info['is_on'] else "OFF"
                        expected_state = "ON" if info['should_be_on'] else "OFF"
                        print(f"   {state_icon} {name}: {current_state} (should be {expected_state})")
                        print(f"      IP: {info['ip']}")
                else:
                    print("\n⚠️ No outdoor lighting devices found")
            
        elif choice == "3":
            # Run original demo
            print("\n🎮 Running original demo mode...")
            await demo_basic_operations()
            await asyncio.sleep(2)
            await demo_advanced_features()
            
            response = input("\n🎮 Would you like to try interactive control mode? (y/n): ").strip().lower()
            if response in ['y', 'yes']:
                await interactive_control()
                
        elif choice == "4":
            print("👋 Goodbye!")
            return
            
        else:
            print("❌ Invalid choice. Please run the program again.")
            
    except KeyboardInterrupt:
        print("\n\n👋 Program interrupted by user")
    except Exception as e:
        print(f"\n❌ Program failed: {e}")


async def run_automation_service(check_interval: int = 300):
    """Run as a background service for automation"""
    controller = OutdoorLightingController(check_interval_seconds=check_interval)
    await controller.monitor_and_control_lights()


if __name__ == "__main__":
    # Check for service mode argument
    if len(sys.argv) > 1 and sys.argv[1] == "--service":
        # Parse optional interval argument
        check_interval = 300  # Default 5 minutes
        if len(sys.argv) > 2:
            try:
                check_interval = int(sys.argv[2])
                if check_interval < 5:
                    print("⚠️ Warning: Interval less than 5 seconds not recommended")
                    check_interval = 5
            except ValueError:
                print("❌ Invalid interval specified, using default 300 seconds")
        
        print("🚀 Starting TP-Link Outdoor Lighting Automation Service...")
        print("📋 Requirements: python-kasa, astral, pytz")
        print("🌐 Ensure devices are on the same network")
        print("📍 Configured for: 720 Front Rd, Pickering, ON")
        print(f"⏰ Check interval: {check_interval} seconds")
        print("🔄 Running in service mode - will restart automatically on errors")
        print()
        
        # Run the automation service directly
        asyncio.run(run_automation_service(check_interval))
    else:
        print("🚀 TP-Link Outdoor Lighting Automation System")
        print("📋 Requirements: python-kasa, astral, pytz")
        print("🌐 Ensure devices are on the same network")
        print("📍 Configured for: 720 Front Rd, Pickering, ON")
        print()
        
        # Run the interactive main function
        asyncio.run(main())