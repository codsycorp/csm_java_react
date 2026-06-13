package config

import "github.com/joho/godotenv"

func godotenvLoadImpl(path string) error {
	return godotenv.Load(path)
}
