import React, { useState, useEffect, useCallback } from "react";
import { FaUser } from "react-icons/fa";
import axios from "axios";

type User = {
  id: string; 
  name: string;
  email: string;
  displayName?: string;
};

type UserTableProps = {
  users: User[];
};

const UserTable: React.FC<UserTableProps> = ({ users }) => {
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [displayNames, setDisplayNames] = useState<{ [key: string]: string }>({});
  const ADMIN_API_BASE_URL = "https://nocd1rav49.execute-api.us-east-1.amazonaws.com/prod";

  // Enhanced iPhone haptic feedback helper
  const triggerHaptic = useCallback((intensity: 'light' | 'medium' | 'heavy' = 'medium') => {
    if ('vibrate' in navigator) {
      const patterns = {
        light: 10,
        medium: 20,
        heavy: 40
      };
      navigator.vibrate(patterns[intensity]);
    }
    
    // Enhanced haptic feedback for modern browsers
    if ('hapticFeedback' in navigator) {
      const intensityLevels = {
        light: 0.3,
        medium: 0.6,
        heavy: 1.0
      };
      (navigator as any).hapticFeedback?.impact(intensityLevels[intensity]);
    }
  }, []);

  useEffect(() => {
  }, []);

  const handleEditClick = useCallback((userId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    triggerHaptic('light');
    if (editingUserId === userId) {
      setEditingUserId(null);
    } else {
      setEditingUserId(userId);
    }
  }, [editingUserId, triggerHaptic]);

  const handleDoubleClick = useCallback((userId: string) => {
    triggerHaptic('medium');
    setEditingUserId(userId);
  }, [triggerHaptic]);

  const handleSaveClick = useCallback(async (userId: string) => {
    const displayName = displayNames[userId];
    triggerHaptic('medium');
    try {
      await axios.post(`${ADMIN_API_BASE_URL}/saveDisplayName`, {
        userId,
        homeId: "720frontrd",
        displayName,
      });
      setEditingUserId(null);
      triggerHaptic('light');
    } catch (error) {
      console.error("Error saving display name for user", userId, error);
      triggerHaptic('heavy');
    }
  }, [displayNames, triggerHaptic]);

  const handleChange = useCallback((userId: string, value: string) => {
    setDisplayNames({ ...displayNames, [userId]: value });
  }, [displayNames]);

  const handleBlur = useCallback((userId: string) => {
    handleSaveClick(userId);
  }, [handleSaveClick]);

  return (
    <div 
      className="bg-gray-800 border border-gray-700 rounded-lg shadow-lg p-4 touch-manipulation"
      style={{
        transform: 'translateZ(0)',
        WebkitTransform: 'translateZ(0)',
        backfaceVisibility: 'hidden',
        WebkitBackfaceVisibility: 'hidden'
      }}
    >
      <h2 className="text-lg font-semibold mb-2 text-white">User Management</h2>
      <div className="overflow-x-auto rounded-lg">
        <table className="min-w-full border-collapse overflow-hidden">
          <thead className="bg-gray-900 text-white">
            <tr>
              <th className="px-4 py-2 border-b border-gray-700">
                <div className="flex items-center justify-center">
                  <FaUser className="mr-2" />
                  User
                </div>
              </th>
              <th className="px-4 py-2 border-b border-gray-700">Name</th>
              <th className="px-4 py-2 border-b border-gray-700">Email</th>
              <th className="px-4 py-2 border-b border-gray-700">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const effectiveDisplayName = displayNames[user.id] ?? user.displayName;
              const isEditing = editingUserId === user.id;

              return (
                <tr
                  key={user.id}
                  className={`bg-gray-800 text-gray-200 even:bg-gray-700 transition-colors duration-200 ${isEditing ? "bg-yellow-700" : ""}`}
                >
                  <td className="px-4 py-2 border-b border-gray-700 text-center">
                    {isEditing ? (
                      <input
                        type="text"
                        value={effectiveDisplayName || ""}
                        onChange={(e) => handleChange(user.id, e.target.value)}
                        onBlur={() => handleBlur(user.id)}
                        className="bg-gray-900 text-white border border-gray-600 rounded p-1 w-full min-h-[44px] touch-manipulation"
                        style={{
                          fontSize: '16px', // Prevents zoom on iOS
                          transform: 'translateZ(0)',
                          backfaceVisibility: 'hidden'
                        }}
                        autoFocus
                      />
                    ) : (
                      <div 
                        onDoubleClick={() => handleDoubleClick(user.id)}
                        className="cursor-pointer touch-manipulation active:scale-95 transition-transform duration-150"
                        style={{
                          transform: 'translateZ(0)',
                          backfaceVisibility: 'hidden'
                        }}
                      >
                        {effectiveDisplayName ? (
                          <div>
                            <div className="text-2xl font-bold">{effectiveDisplayName}</div>
                            <div className="text-sm text-gray-400">{user.id}</div>
                          </div>
                        ) : (
                          <span className="text-xl font-bold">{user.id}</span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2 border-b border-gray-700">{user.name}</td>
                  <td className="px-4 py-2 border-b border-gray-700">{user.email}</td>
                  <td className="px-4 py-2 border-b border-gray-700 text-center">
                    {isEditing ? (
                      <button 
                        onClick={() => handleSaveClick(user.id)} 
                        className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-all duration-200 min-h-[44px] min-w-[80px] touch-manipulation active:scale-95"
                        style={{
                          transform: 'translateZ(0)',
                          backfaceVisibility: 'hidden',
                          WebkitTapHighlightColor: 'transparent'
                        }}
                      >
                        Save
                      </button>
                    ) : (
                      <button 
                        onClick={(e) => handleEditClick(user.id, e)} 
                        className="px-3 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-md transition-all duration-200 min-h-[44px] min-w-[80px] touch-manipulation active:scale-95"
                        style={{
                          transform: 'translateZ(0)',
                          backfaceVisibility: 'hidden',
                          WebkitTapHighlightColor: 'transparent'
                        }}
                      >
                        Edit
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default UserTable;
