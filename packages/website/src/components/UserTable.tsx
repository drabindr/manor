import React, { useState, useEffect } from "react";
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

  useEffect(() => {
  }, []);

  const handleEditClick = (userId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (editingUserId === userId) {
      setEditingUserId(null);
    } else {
      setEditingUserId(userId);
    }
  };

  const handleDoubleClick = (userId: string) => {
    setEditingUserId(userId);
  };

  const handleSaveClick = async (userId: string) => {
    const displayName = displayNames[userId];
    try {
      await axios.post(`${ADMIN_API_BASE_URL}/saveDisplayName`, {
        userId,
        homeId: "720frontrd",
        displayName,
      });
      setEditingUserId(null);
    } catch (error) {
      console.error("Error saving display name for user", userId, error);
    }
  };

  const handleChange = (userId: string, value: string) => {
    setDisplayNames({ ...displayNames, [userId]: value });
  };

  const handleBlur = (userId: string) => {
    handleSaveClick(userId);
  };

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg shadow-lg p-4">
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
                  className={`bg-gray-800 text-gray-200 even:bg-gray-700 ${isEditing ? "bg-yellow-700" : ""}`}
                >
                  <td className="px-4 py-2 border-b border-gray-700 text-center">
                    {isEditing ? (
                      <input
                        type="text"
                        value={effectiveDisplayName || ""}
                        onChange={(e) => handleChange(user.id, e.target.value)}
                        onBlur={() => handleBlur(user.id)}
                        className="bg-gray-900 text-white border border-gray-600 rounded p-1 w-full"
                        autoFocus
                      />
                    ) : (
                      <div onDoubleClick={() => handleDoubleClick(user.id)}>
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
                      <button onClick={() => handleSaveClick(user.id)} className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition duration-150">
                        Save
                      </button>
                    ) : (
                      <button onClick={(e) => handleEditClick(user.id, e)} className="px-3 py-1 bg-gray-600 hover:bg-gray-700 text-white rounded-md transition duration-150">
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
