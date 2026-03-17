import { invoke } from "@tauri-apps/api/core";

export const setPassword = async (
  service: string,
  account: string,
  password: string,
) => {
  // Combine service and account to create a single unique key
  const key = `${service}:${account}`;
  
  // Use 'save_item' instead of 'set_password'
  return invoke("plugin:keychain|save_item", {
    key,
    password,
  });
};

export const getPassword = async (service: string, account: string) => {
  const key = `${service}:${account}`;
  
  // Use 'get_item' instead of 'get_password'
  return invoke<string>("plugin:keychain|get_item", { 
    key 
  });
};

export const deletePassword = async (service: string, account: string) => {
  const key = `${service}:${account}`;
  
  // Use 'remove_item' instead of 'delete_password'
  return invoke("plugin:keychain|remove_item", { 
    key 
  });
};