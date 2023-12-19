#!/usr/bin/python3

from pymongo import MongoClient
import bcrypt
import os
import sys
from datetime import datetime
from dotenv import load_dotenv
import string
import random


class User:

    def __init__(self) -> None:
        load_dotenv('/etc/hcw-athome/hcw-athome.conf')

        client = MongoClient(os.getenv('DB_URI'))
        self.db = client.get_database()

    def generate_password(self, length):
        characters = string.ascii_letters + string.digits
        password = ''.join(random.choice(characters) for _ in range(length))
        return password

    def define_role(self):
        role = None
        while not role:
            role = input("Choose a role admin/doctor [doctor]: ")
            if role == '':
                role = "admin"
            if role in ["admin", "doctor"]:
                return role
            print(f"Sorry, role {role} is not valid")
            role = None

    def create(self):

        try:
            user_email = sys.argv[2]
        except:
            user_email = input("Enter email account: ")

        try:
            user_firstname = sys.argv[3]
        except:
            user_firstname = input("Enter firstname account: ")

        try:
            user_lastname = sys.argv[4]
        except:
            user_lastname = input("Enter lastname account: ")

        try:
            user_role = sys.argv[5]
        except:
            user_role = self.define_role()

        password = self.generate_password(10)
        print(f"Generated password: {password}")

        salt = bcrypt.gensalt(10)
        hashed_password = bcrypt.hashpw(
            password.encode('utf-8'), salt).decode()
        user_data = {
            "email": user_email,
            "firstName": user_firstname,
            "lastName": user_lastname,
            "role": user_role,
            "createdAt": datetime.now(),
            "password": hashed_password,
            "updatedAt": datetime.now(),
            "username": user_email,
            "phoneNumber": ""
        }

        self.db.user.insert_one(user_data)

    def list_items(self):
        users = self.db.user.find({"role": {'$in': ["admin", "doctor"]}})
        print("Email | Firstname | Lastname | role")
        for user in users:
            print(
                f"{user['email']} | {user['firstName']} | {user['lastName']} | {user['role']}")

    def delete(self):
        try:
            user_email = sys.argv[2]
        except:
            user_email = input("Enter email account: ")
        self.db.user.delete_one({"email": user_email})

    def promote(self):
        try:
            user_email = sys.argv[2]
        except:
            user_email = input("Enter email account: ")

        try:
            user_role = sys.argv[5]
        except:
            user_role = self.define_role()

        self.db.user.update_one({"email": user_email}, {
                                "$set": {"role": user_role}})


if len(sys.argv) != 2:
    print("Usage: python script.py <create|list|delete|promote>")
else:
    u = User()
    command = sys.argv[1]

    if command == "create":
        u.create()
    elif command == "list":
        u.list_items()
    elif command == "delete":
        u.delete()
    elif command == "promote":
        u.promote()
    else:
        print(
            "Command not recodnized. Usage : python script.py <create|list|delete|promote>")
