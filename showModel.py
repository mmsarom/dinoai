import tensorflow as tf

# Load the TensorFlow.js SavedModel using TFSMLayer
model = tf.keras.layers.TFSMLayer('./model', call_endpoint='serving_default')

# Log the model to TensorBoard
log_dir = './logs'
writer = tf.summary.create_file_writer(log_dir)
with writer.as_default():
    tf.summary.graph(model.input, step=0)

print("Model loaded and logged to TensorBoard.")